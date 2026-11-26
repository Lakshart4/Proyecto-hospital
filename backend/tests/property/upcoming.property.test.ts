// Prueba de propiedades de la ventana de próximas entregas y actividades (tarea 3.25, Property 22).
//
// Se generan un instante "hoy" en 2026 (a cualquier hora, incluidas las 18:00–23:59 de México, cuando
// en UTC ya es el día siguiente) y elementos de calendario de todos los orígenes: Eventos de los cuatro
// tipos guardados, entregas en los tres estados y elementos de día completo (cumpleaños, Días_Inhábiles,
// feriados). Los inicios se concentran en los límites exactos de la ventana (y 1 ms fuera), con muchos
// empates. El oráculo es independiente de domain/time.ts: en 2026 México está fijo en UTC-6 (sin horario
// de verano desde 2022), así que la ventana se calcula con ese desfase.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { birthdayEvents, fromDelivery, fromEvent, fromHoliday, fromNonWorkingDay, upcomingWindow, type CalendarEvent } from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const DAY = 86_400_000;
const OFFSET = -6 * 3_600_000; // America/Mexico_City en 2026
const YEAR_START = Date.UTC(2026, 0, 1);
const YEAR_END = Date.UTC(2026, 11, 20);

/** Ventana esperada: desde las 00:00 locales de hoy hasta el final del día hoy + 7, en instantes UTC. */
function expectedWindow(today: number): { from: number; to: number } {
  const localDay = Math.floor((today + OFFSET) / DAY);
  const from = localDay * DAY - OFFSET;
  return { from, to: from + 8 * DAY - 1 };
}

const isEligible = (item: CalendarEvent) =>
  (item.source === 'event' && (item.type === 'actividad' || item.type === 'entrega')) ||
  (item.source === 'delivery' && item.delivery?.status === 'programada');

type Kind = 'event' | 'delivery' | 'birthday' | 'nonWorkingDay' | 'holiday';
type StartMode = 'windowStart' | 'beforeStart' | 'windowEnd' | 'afterEnd' | 'random' | 'shared';

const itemSpecArb: fc.Arbitrary<ItemSpec> = fc.record({
  kind: fc.oneof({ arbitrary: fc.constantFrom<Kind>('event', 'delivery'), weight: 6 }, { arbitrary: fc.constantFrom<Kind>('birthday', 'nonWorkingDay', 'holiday'), weight: 1 }),
  eventType: fc.constantFrom('general' as const, 'actividad' as const, 'entrega' as const, 'agenda individual' as const),
  status: fc.constantFrom('programada' as const, 'recibida' as const, 'cancelada' as const),
  startMode: fc.constantFrom<StartMode>('windowStart', 'beforeStart', 'windowEnd', 'afterEnd', 'random', 'shared'),
  randomOffset: fc.integer({ min: -3 * DAY, max: 11 * DAY }),
  durationMs: fc.integer({ min: 0, max: 5 * 3_600_000 }),
});

/** Actividad o entrega dentro de la ventana, a menudo con la misma fecha (empates). */
const denseSpecArb: fc.Arbitrary<ItemSpec> = fc.record({
  kind: fc.constant<Kind>('event'),
  eventType: fc.constantFrom('actividad' as const, 'entrega' as const),
  status: fc.constant('programada' as const),
  startMode: fc.constantFrom<StartMode>('shared', 'windowStart', 'windowEnd'),
  randomOffset: fc.constant(0),
  durationMs: fc.integer({ min: 0, max: 3_600_000 }),
});

const scenarioArb = fc.record({
  today: fc.oneof(
    fc.integer({ min: YEAR_START, max: YEAR_END }),
    // 18:00–23:59 en México: en UTC ya es el día siguiente.
    fc.tuple(fc.integer({ min: 0, max: 340 }), fc.integer({ min: 0, max: 6 * 3_600_000 - 1 })).map(([d, ms]) => YEAR_START + d * DAY + ms),
  ),
  specs: fc.oneof(
    fc.array(itemSpecArb, { maxLength: 20 }),
    // Muchos elegibles dentro de la ventana (más de 50), mezclados con otros, para probar el máximo.
    fc.array(fc.oneof({ arbitrary: denseSpecArb, weight: 4 }, { arbitrary: itemSpecArb, weight: 1 }), { minLength: 65, maxLength: 85 }),
  ),
  sharedOffset: fc.integer({ min: 0, max: 8 * DAY - 1 }),
});

interface ItemSpec {
  kind: Kind;
  eventType: 'general' | 'actividad' | 'entrega' | 'agenda individual';
  status: 'programada' | 'recibida' | 'cancelada';
  startMode: StartMode;
  randomOffset: number;
  durationMs: number;
}

function buildItem(spec: ItemSpec, index: number, today: number, shared: number): CalendarEvent {
  const { from, to } = expectedWindow(today);
  const start =
    spec.startMode === 'windowStart' ? from
    : spec.startMode === 'beforeStart' ? from - 1
    : spec.startMode === 'windowEnd' ? to
    : spec.startMode === 'afterEnd' ? to + 1
    : spec.startMode === 'shared' ? from + shared
    : from + spec.randomOffset;
  const startAt = new Date(start);
  switch (spec.kind) {
    case 'event':
      return fromEvent({ id: index, title: `E${index}`, type: spec.eventType, startAt, endAt: new Date(start + spec.durationMs) });
    case 'delivery':
      return fromDelivery({ id: index, status: spec.status, scheduledDate: startAt, supplierName: 'P', productName: `X${index}`, quantityRequested: 1 });
    case 'nonWorkingDay': {
      const local = new Date(start + OFFSET);
      return fromNonWorkingDay({ id: index, title: 'Inhábil', date: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())) });
    }
    case 'holiday':
      return fromHoliday({ date: new Date(start + OFFSET).toISOString().slice(0, 10), name: 'Feriado' });
    case 'birthday': {
      const local = new Date(start + OFFSET);
      const [b] = birthdayEvents(
        [{ id: index, name: 'C', role: 'NURSE', active: true, shift: 'matutino', birthDate: new Date(Date.UTC(1990, local.getUTCMonth(), local.getUTCDate())), schedule: [] }],
        2026,
      );
      return b as CalendarEvent;
    }
  }
}

describe('Próximas entregas y actividades (propiedades)', () => {
  // Feature: hospital-management-system, Property 22: Ventana de próximas entregas y actividades
  it('Property 22: solo actividades, entregas y entregas programadas de hoy a hoy + 7 (hora de México), en orden y como máximo 50', () => {
    fc.assert(
      fc.property(scenarioArb, ({ today, specs, sharedOffset }) => {
        const items = specs.map((s, i) => buildItem(s, i + 1, today, sharedOffset));
        const before = items.map((i) => ({ ...i, start: i.start.getTime(), end: i.end.getTime() }));
        const result = upcomingWindow(items, new Date(today));
        const { from, to } = expectedWindow(today);

        const eligible = items.filter((i) => isEligible(i) && i.start.getTime() >= from && i.start.getTime() <= to);

        // Cantidad: todos los elegibles, con un máximo de 50; vacía si ninguno cumple.
        expect(result).toHaveLength(Math.min(50, eligible.length));
        // Solo elementos elegibles, sin repetir.
        expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
        for (const r of result) expect(eligible.map((e) => e.id)).toContain(r.id);
        // Orden ascendente por fecha (los empates pueden ir en cualquier orden).
        for (let k = 1; k < result.length; k++) expect(result[k - 1]!.start.getTime()).toBeLessThanOrEqual(result[k]!.start.getTime());
        // Con más de 50, se quedan los 50 más próximos.
        if (result.length > 0) {
          const last = result[result.length - 1]!.start.getTime();
          const left = eligible.filter((e) => !result.some((r) => r.id === e.id));
          for (const e of left) expect(e.start.getTime()).toBeGreaterThanOrEqual(last);
        }

        // La entrada no se modifica.
        expect(items.map((i) => ({ ...i, start: i.start.getTime(), end: i.end.getTime() }))).toEqual(before);
      }),
      RUNS,
    );
  });
});
