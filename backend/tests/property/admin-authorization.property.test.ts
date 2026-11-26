// Prueba de propiedades de vigencia de la Autorización_Administrativa (tarea 4.16, Property 28).
// Autorización otorgada en un instante al azar con vencimiento a los 10 minutos, ligada a una Sesión;
// consulta desde la misma Sesión u otra, revocada o no, a desfases cercanos al vencimiento (−1 ms, 0,
// +1 ms) o al azar. Revocarla (o cerrar la Sesión, que deja de coincidir) la invalida.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isAdminAuthorizationValid } from '../../src/domain/tokens';

const RUNS = { numRuns: 100 };
const TTL = 10 * 60 * 1000;

const offsetArb = fc.oneof(
  { arbitrary: fc.constantFrom(TTL - 1, TTL, TTL + 1, 0), weight: 3 },
  fc.integer({ min: 0, max: 2 * TTL }),
);

describe('Autorización_Administrativa (propiedades)', () => {
  // Feature: hospital-management-system, Property 28: Vigencia de la Autorización_Administrativa
  it('Property 28: válida si y solo si pertenece a la Sesión actual, no está revocada y now < expiresAt; revocarla o cambiar de Sesión la invalida', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.integer({ min: 1, max: 4 }),
        fc.integer({ min: 1, max: 4 }),
        fc.option(fc.integer({ min: 0, max: TTL }), { nil: null, freq: 3 }),
        offsetArb,
        (granted, sessionId, currentSessionId, revokedOffset, offset) => {
          const authorization = {
            sessionId,
            expiresAt: new Date(granted + TTL),
            revokedAt: revokedOffset === null ? null : new Date(granted + revokedOffset),
          };
          const now = new Date(granted + offset);
          const expected = sessionId === currentSessionId && revokedOffset === null && offset < TTL;
          expect(isAdminAuthorizationValid(authorization, currentSessionId, now)).toBe(expected);

          if (expected) {
            expect(isAdminAuthorizationValid({ ...authorization, revokedAt: now }, currentSessionId, now)).toBe(false);
            expect(isAdminAuthorizationValid(authorization, currentSessionId + 1, now)).toBe(false);
          }
        },
      ),
      RUNS,
    );
  });
});
