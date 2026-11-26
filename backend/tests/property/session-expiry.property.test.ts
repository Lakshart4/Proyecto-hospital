// Prueba de propiedades de la expiración de sesión por inactividad (tarea 4.3, Property 2).
// Diferencias alrededor del límite (30 min − 1 ms, 30 min, 30 min + 1 ms, + 1 s) y al azar hasta 3 h,
// sobre instantes de 1970 a 2100. El oráculo compara milisegundos con 1 800 000.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isSessionExpired } from '../../src/domain/tokens';

const RUNS = { numRuns: 100 };
const LIMIT_MS = 1_800_000;

const diffArb = fc.oneof(
  { arbitrary: fc.constantFrom(0, 1, LIMIT_MS - 1, LIMIT_MS, LIMIT_MS + 1, LIMIT_MS + 999, LIMIT_MS + 1000), weight: 3 },
  fc.integer({ min: 0, max: 3 * 3_600_000 }),
);

describe('Expiración de sesión (propiedades)', () => {
  // Feature: hospital-management-system, Property 2: Expiración de sesión por inactividad
  it('Property 2: con now >= lastActivityAt, isSessionExpired es verdadero si y solo si pasaron más de 30 minutos', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 4_102_444_800_000 }), diffArb, (start, diff) => {
        const last = new Date(start);
        const now = new Date(start + diff);
        expect(isSessionExpired(last, now)).toBe(diff > LIMIT_MS);
        // Las fechas recibidas no cambian.
        expect(last.getTime()).toBe(start);
        expect(now.getTime()).toBe(start + diff);
      }),
      RUNS,
    );
  });
});
