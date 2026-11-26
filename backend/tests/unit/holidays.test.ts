// Pruebas de feriados: parseYear, parseNagerHolidays y el servicio con caché (tarea 3.32).
// No hay llamadas reales a Internet: `fetch` y el reloj son simulados.
// Las propiedades 37 y 38 corresponden a las tareas 3.33 y 3.34.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { INVALID_YEAR_MESSAGE, parseNagerHolidays, parseYear } from '../../src/domain/holidays';
import { ValidationError } from '../../src/lib/errors';
import { HOLIDAY_CACHE_TTL_MS, HOLIDAY_TIMEOUT_MS, createHolidayService, type FetchLike } from '../../src/services/holidays.service';

const NAGER_2026 = [
  { date: '2026-01-01', localName: 'Año Nuevo', name: "New Year's Day", countryCode: 'MX' },
  { date: '2026-09-16', localName: 'Día de la Independencia', name: 'Independence Day', countryCode: 'MX' },
];

/** `fetch` simulado que registra las URL y responde con la función indicada. */
function fakeFetch(respond: (url: string, signal: AbortSignal) => Promise<{ ok: boolean; json(): Promise<unknown> }>) {
  const calls: string[] = [];
  const fetch: FetchLike = (url, init) => {
    calls.push(url);
    return respond(url, init.signal);
  };
  return { fetch, calls };
}
const okJson = (body: unknown) => async () => ({ ok: true, json: async () => body });

afterEach(() => {
  vi.useRealTimers();
});

describe('parseYear', () => {
  it('acepta enteros de 1900 a 2100, como texto o número', () => {
    expect(parseYear('1900')).toBe(1900);
    expect(parseYear('2026')).toBe(2026);
    expect(parseYear(2100)).toBe(2100);
  });

  it.each(['1899', '2101', 'abc', '2026.5', '', ' 2026', '2e3', undefined, null, 2026.5])('rechaza %j con ValidationError en el campo year', (value) => {
    try {
      parseYear(value);
      throw new Error('no lanzó');
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError);
      expect((error as ValidationError).errors).toEqual([{ field: 'year', message: INVALID_YEAR_MESSAGE }]);
    }
  });
});

describe('parseNagerHolidays', () => {
  it('toma la fecha y el nombre local de cada feriado', () => {
    expect(parseNagerHolidays(NAGER_2026, 2026)).toEqual([
      { date: '2026-01-01', name: 'Año Nuevo' },
      { date: '2026-09-16', name: 'Día de la Independencia' },
    ]);
  });

  it('usa `name` si falta el nombre local y acepta una lista vacía', () => {
    expect(parseNagerHolidays([{ date: '2026-05-01', name: 'Labour Day' }], 2026)).toEqual([{ date: '2026-05-01', name: 'Labour Day' }]);
    expect(parseNagerHolidays([], 2026)).toEqual([]);
  });

  it.each([{ error: 'x' }, null, 'texto', [{ date: '2026-13-01', name: 'X' }], [{ date: '2025-01-01', name: 'X' }], [{ date: '2026-01-01' }]])(
    'devuelve null con un cuerpo inválido (%j)',
    (body) => {
      expect(parseNagerHolidays(body, 2026)).toBeNull();
    },
  );
});

describe('createHolidayService', () => {
  const base = { enabled: true, country: 'MX' };

  it('consulta Nager.Date sin claves y devuelve los feriados disponibles', async () => {
    const { fetch, calls } = fakeFetch(okJson(NAGER_2026));
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    await expect(service.getHolidays('2026')).resolves.toEqual({
      available: true,
      data: [
        { date: '2026-01-01', name: 'Año Nuevo' },
        { date: '2026-09-16', name: 'Día de la Independencia' },
      ],
    });
    expect(calls).toEqual(['https://date.nager.at/api/v3/PublicHolidays/2026/MX']);
  });

  it('atiende el mismo año desde memoria durante 24 horas y vuelve a consultar al cumplirse', async () => {
    let time = 1_000;
    const { fetch, calls } = fakeFetch(okJson(NAGER_2026));
    const service = createHolidayService({ ...base, fetch, now: () => time });
    const first = await service.getHolidays(2026);
    time += HOLIDAY_CACHE_TTL_MS - 1;
    expect(await service.getHolidays(2026)).toEqual(first);
    expect(calls).toHaveLength(1);
    time += 1; // 24 h exactas desde la consulta
    await service.getHolidays(2026);
    expect(calls).toHaveLength(2);
  });

  it('la caché es por año', async () => {
    const { fetch, calls } = fakeFetch(async (url) => ({ ok: true, json: async () => (url.includes('/2027/') ? [] : NAGER_2026) }));
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    await service.getHolidays(2026);
    await service.getHolidays(2027);
    await service.getHolidays(2026);
    expect(calls).toHaveLength(2);
  });

  it('una lista vacía es una respuesta correcta y se guarda', async () => {
    const { fetch, calls } = fakeFetch(okJson([]));
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    expect(await service.getHolidays(2026)).toEqual({ available: true, data: [] });
    await service.getHolidays(2026);
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['un error HTTP', async () => ({ ok: false, json: async () => ({}) })],
    ['un fallo de conexión', async () => Promise.reject(new TypeError('fetch failed'))],
    ['un cuerpo inválido', okJson({ message: 'error' })],
    ['un JSON ilegible', async () => ({ ok: true, json: async () => Promise.reject(new SyntaxError('JSON')) })],
  ])('con %s devuelve no disponible y no guarda nada', async (_label, respond) => {
    const { fetch, calls } = fakeFetch(respond);
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    expect(await service.getHolidays(2026)).toEqual({ available: false, data: [] });
    expect(await service.getHolidays(2026)).toEqual({ available: false, data: [] });
    expect(calls).toHaveLength(2);
  });

  it('cancela la consulta a los 3 segundos y devuelve no disponible', async () => {
    vi.useFakeTimers();
    const { fetch } = fakeFetch(
      (_url, signal) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    const pending = service.getHolidays(2026);
    await vi.advanceTimersByTimeAsync(HOLIDAY_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ available: false, data: [] });
    expect(HOLIDAY_TIMEOUT_MS).toBe(3000);
  });

  it('después de un fallo, una consulta correcta sí se guarda', async () => {
    let fail = true;
    const { fetch, calls } = fakeFetch(async () => (fail ? Promise.reject(new Error('red')) : { ok: true, json: async () => NAGER_2026 }));
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    expect((await service.getHolidays(2026)).available).toBe(false);
    fail = false;
    expect((await service.getHolidays(2026)).available).toBe(true);
    expect((await service.getHolidays(2026)).available).toBe(true);
    expect(calls).toHaveLength(2);
  });

  it('un año inválido lanza ValidationError sin consultar Nager.Date', async () => {
    const { fetch, calls } = fakeFetch(okJson(NAGER_2026));
    const service = createHolidayService({ ...base, fetch });
    await expect(service.getHolidays('1899')).rejects.toBeInstanceOf(ValidationError);
    await expect(service.getHolidays('abc')).rejects.toBeInstanceOf(ValidationError);
    expect(calls).toEqual([]);
  });

  it('con la integración deshabilitada devuelve no disponible sin consultar', async () => {
    const { fetch, calls } = fakeFetch(okJson(NAGER_2026));
    const service = createHolidayService({ ...base, enabled: false, fetch });
    expect(await service.getHolidays(2026)).toEqual({ available: false, data: [] });
    expect(calls).toEqual([]);
  });

  it('modificar el resultado no altera la caché', async () => {
    const { fetch } = fakeFetch(okJson(NAGER_2026));
    const service = createHolidayService({ ...base, fetch, now: () => 0 });
    const first = await service.getHolidays(2026);
    first.data[0]!.name = 'cambiado';
    first.data.pop();
    expect((await service.getHolidays(2026)).data).toEqual([
      { date: '2026-01-01', name: 'Año Nuevo' },
      { date: '2026-09-16', name: 'Día de la Independencia' },
    ]);
  });
});
