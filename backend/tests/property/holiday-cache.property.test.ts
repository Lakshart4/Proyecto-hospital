// Prueba de propiedades de la caché de feriados (tarea 3.34, Property 38).
//
// Se genera una secuencia de solicitudes con años repetidos, avances del reloj (incluidos 24 h − 1 ms,
// 24 h y 24 h + 1 ms) y el resultado que daría Nager.Date si se le consultara: éxito (con o sin feriados),
// error HTTP, error de red, cuerpo mal formado, JSON ilegible o tiempo agotado (3 s, con temporizadores
// simulados). Un modelo independiente (mapa año → instante y datos del último éxito) decide si cada
// solicitud debe consultar Nager.Date o atenderse desde memoria, y qué resultado debe devolverse.
// No se hacen llamadas reales a Internet: `fetch` y el reloj se inyectan.

import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HolidayLike } from '../../src/domain/events';
import { createHolidayService, HOLIDAY_TIMEOUT_MS, type FetchLike } from '../../src/services/holidays.service';

const RUNS = { numRuns: 100 };
const DAY_MS = 24 * 60 * 60 * 1000;
const COUNTRY = 'MX';

type Outcome = 'ok' | 'http-error' | 'network-error' | 'malformed' | 'bad-json' | 'timeout';

interface Step {
  year: number;
  advanceMs: number;
  outcome: Outcome;
  holidays: { month: number; day: number; label: string }[];
}

const labelArb = fc.string({ minLength: 1, maxLength: 10 }).filter((s) => s.trim() === s && s !== '');

const stepArb: fc.Arbitrary<Step> = fc.record({
  year: fc.constantFrom(2024, 2025, 2100),
  advanceMs: fc.oneof(
    { arbitrary: fc.constantFrom(0, 1, DAY_MS - 1, DAY_MS, DAY_MS + 1), weight: 3 },
    fc.integer({ min: 0, max: 2 * DAY_MS }),
  ),
  outcome: fc.oneof(
    { arbitrary: fc.constant<Outcome>('ok'), weight: 4 },
    fc.constantFrom<Outcome>('http-error', 'network-error', 'malformed', 'bad-json', 'timeout'),
  ),
  holidays: fc.array(
    fc.record({ month: fc.integer({ min: 1, max: 12 }), day: fc.integer({ min: 1, max: 28 }), label: labelArb }),
    { maxLength: 3 },
  ),
});

const pad = (n: number) => String(n).padStart(2, '0');

describe('Caché de feriados (propiedades)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // Feature: hospital-management-system, Property 38: Caché de feriados de 24 horas
  it('Property 38: una sola consulta a Nager.Date por año en cada ventana de 24 h tras un éxito, el resto desde memoria con el mismo resultado; fallos y tiempo agotado devuelven available false y no se guardan', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 0, max: 4_000_000_000_000 }), fc.array(stepArb, { minLength: 1, maxLength: 25 }), async (start, steps) => {
        let clock = start;
        let current: Step = steps[0]!;
        const calls: string[] = [];
        const fetch: FetchLike = (url, init) => {
          calls.push(url);
          const step = current;
          const body = step.holidays.map((h, i) => ({
            date: `${step.year}-${pad(h.month)}-${pad(h.day)}`,
            localName: `${h.label} ${i}`,
            name: `Holiday ${i}`,
            countryCode: COUNTRY,
          }));
          switch (step.outcome) {
            case 'ok':
              return Promise.resolve({ ok: true, json: async () => body });
            case 'http-error':
              return Promise.resolve({ ok: false, json: async () => ({ message: 'error' }) });
            case 'network-error':
              return Promise.reject(new TypeError('fetch failed'));
            case 'malformed':
              return Promise.resolve({ ok: true, json: async () => [{ date: 'no-es-fecha', localName: 'X' }] });
            case 'bad-json':
              return Promise.resolve({ ok: true, json: async () => { throw new SyntaxError('JSON inválido'); } });
            case 'timeout':
              return new Promise((_resolve, reject) => {
                init.signal.addEventListener('abort', () => reject(new Error('aborted')));
              });
          }
        };
        const service = createHolidayService({ enabled: true, country: COUNTRY, fetch, now: () => clock });

        // Modelo: último éxito por año.
        const model = new Map<number, { storedAt: number; data: HolidayLike[] }>();

        for (const step of steps) {
          current = step;
          clock += step.advanceMs;
          const before = calls.length;
          const entry = model.get(step.year);
          const cached = entry !== undefined && clock - entry.storedAt < DAY_MS ? entry : undefined;

          let settled = false;
          const pending = service.getHolidays(String(step.year)).finally(() => {
            settled = true;
          });
          if (cached === undefined && step.outcome === 'timeout') {
            await vi.advanceTimersByTimeAsync(HOLIDAY_TIMEOUT_MS - 1);
            expect(settled).toBe(false);
            await vi.advanceTimersByTimeAsync(1);
          }
          const result = await pending;

          if (cached !== undefined) {
            expect(calls.length).toBe(before);
            expect(result).toEqual({ available: true, data: cached.data });
          } else {
            expect(calls.slice(before)).toEqual([`https://date.nager.at/api/v3/PublicHolidays/${step.year}/${COUNTRY}`]);
            if (step.outcome === 'ok') {
              const data = step.holidays.map((h, i) => ({ date: `${step.year}-${pad(h.month)}-${pad(h.day)}`, name: `${h.label} ${i}` }));
              expect(result).toEqual({ available: true, data });
              model.set(step.year, { storedAt: clock, data });
            } else {
              expect(result).toEqual({ available: false, data: [] });
            }
          }

          // Modificar lo devuelto no debe alterar lo que se atiende después desde memoria.
          for (const h of result.data) h.name = 'modificado';
          result.data.push({ date: `${step.year}-01-01`, name: 'intruso' });
        }
      }),
      RUNS,
    );
  });
});
