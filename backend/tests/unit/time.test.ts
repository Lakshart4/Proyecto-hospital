// Pruebas de la zona horaria institucional y las fechas naturales (tarea 3.24).

import { describe, expect, it } from 'vitest';
import {
  INSTITUTIONAL_TIME_ZONE,
  addDays,
  dayOfWeek,
  dayRange,
  isNaturalDate,
  localDateOf,
  naturalDateOf,
  naturalDateToStored,
  zoneOffsetMs,
  zonedTimeToUtc,
} from '../../src/domain/time';

const HOUR = 3_600_000;

describe('zona institucional', () => {
  it('es America/Mexico_City, con desfase de -6 h en 2026', () => {
    expect(INSTITUTIONAL_TIME_ZONE).toBe('America/Mexico_City');
    expect(zoneOffsetMs(new Date('2026-03-10T12:00:00Z'))).toBe(-6 * HOUR);
    expect(zoneOffsetMs(new Date('2026-07-10T12:00:00Z'))).toBe(-6 * HOUR);
  });

  it('respeta el horario de verano histórico (2021: -5 h en julio)', () => {
    expect(zoneOffsetMs(new Date('2021-07-01T12:00:00Z'))).toBe(-5 * HOUR);
    expect(zonedTimeToUtc('2021-07-01', '08:00').toISOString()).toBe('2021-07-01T13:00:00.000Z');
  });
});

describe('localDateOf: cambio de fecha entre UTC y hora institucional', () => {
  it('antes de las 06:00 UTC todavía es el día anterior en México', () => {
    expect(localDateOf(new Date('2026-03-11T05:59:59.999Z'))).toBe('2026-03-10');
    expect(localDateOf(new Date('2026-03-11T06:00:00.000Z'))).toBe('2026-03-11');
  });

  it('el fin de año cambia a las 06:00 UTC del 1 de enero', () => {
    expect(localDateOf(new Date('2027-01-01T05:00:00Z'))).toBe('2026-12-31');
  });
});

describe('zonedTimeToUtc y dayRange', () => {
  it('convierte una hora institucional a su instante UTC', () => {
    expect(zonedTimeToUtc('2026-03-10', '08:00').toISOString()).toBe('2026-03-10T14:00:00.000Z');
    expect(zonedTimeToUtc('2026-03-10', '23:59').toISOString()).toBe('2026-03-11T05:59:00.000Z');
  });

  it('el día natural va de la medianoche institucional a 1 ms antes de la siguiente', () => {
    const { start, end } = dayRange('2026-03-10');
    expect(start.toISOString()).toBe('2026-03-10T06:00:00.000Z');
    expect(end.toISOString()).toBe('2026-03-11T05:59:59.999Z');
  });

  it('rechaza fechas y horas inválidas', () => {
    expect(() => zonedTimeToUtc('2026-02-30', '08:00')).toThrow(RangeError);
    expect(() => zonedTimeToUtc('2026-03-10', '24:00')).toThrow(RangeError);
  });
});

describe('fechas naturales', () => {
  it('se leen y se guardan con partes UTC, sin zona horaria', () => {
    const stored = new Date('1992-02-29T00:00:00Z');
    expect(naturalDateOf(stored)).toBe('1992-02-29');
    expect(naturalDateToStored('1992-02-29').toISOString()).toBe('1992-02-29T00:00:00.000Z');
  });

  it('suma días entre meses y años, incluido el 29 de febrero', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('calcula el día de la semana (0 = domingo)', () => {
    expect(dayOfWeek('2026-03-08')).toBe(0);
    expect(dayOfWeek('2026-03-09')).toBe(1);
    expect(dayOfWeek('2026-03-14')).toBe(6);
  });

  it('valida el formato AAAA-MM-DD y la existencia de la fecha', () => {
    expect(isNaturalDate('2026-03-10')).toBe(true);
    for (const bad of ['2026-3-10', '2026-02-30', '10/03/2026', '', null]) expect(isNaturalDate(bad)).toBe(false);
  });
});
