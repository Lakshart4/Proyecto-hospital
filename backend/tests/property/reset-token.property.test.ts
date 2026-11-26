// Prueba de propiedades de vigencia del Token_de_Recuperación (tarea 4.15, Property 27).
// Token emitido en un instante al azar con vencimiento a los 30 minutos; token presentado igual, otro
// token o texto al azar; usado o no; consulta a desfases cercanos al vencimiento (−1 ms, 0, +1 ms) o al
// azar. Después de un restablecimiento exitoso (usedAt = now) el mismo token deja de ser utilizable.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { isResetTokenUsable } from '../../src/domain/tokens';
import { generateToken, hashToken } from '../../src/lib/tokens';

const RUNS = { numRuns: 100 };
const TTL = 30 * 60 * 1000;

const offsetArb = fc.oneof(
  { arbitrary: fc.constantFrom(TTL - 1, TTL, TTL + 1, 0), weight: 3 },
  fc.integer({ min: 0, max: 2 * TTL }),
);

describe('Token_de_Recuperación (propiedades)', () => {
  // Feature: hospital-management-system, Property 27: Vigencia del Token_de_Recuperación
  it('Property 27: utilizable si y solo si el hash coincide, no se usó y now <= expiresAt; tras un restablecimiento exitoso deja de ser utilizable', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.constantFrom<'same' | 'other' | 'plain' | 'random'>('same', 'same', 'other', 'plain', 'random'),
        fc.string({ maxLength: 70 }),
        fc.option(fc.integer({ min: 0, max: TTL }), { nil: null }),
        offsetArb,
        (created, presentedKind, randomText, usedOffset, offset) => {
          const token = generateToken();
          const stored = {
            hash: hashToken(token),
            expiresAt: new Date(created + TTL),
            usedAt: usedOffset === null ? null : new Date(created + usedOffset),
          };
          const presented =
            presentedKind === 'same' ? hashToken(token)
            : presentedKind === 'other' ? hashToken(generateToken())
            : presentedKind === 'plain' ? token
            : randomText;
          const now = new Date(created + offset);

          const expected = presented === stored.hash && stored.usedAt === null && offset <= TTL;
          expect(isResetTokenUsable(stored, presented, now)).toBe(expected);

          if (expected) {
            // Restablecimiento exitoso: el servicio marca usedAt; el mismo token ya no sirve.
            const used = { ...stored, usedAt: now };
            expect(isResetTokenUsable(used, presented, now)).toBe(false);
          }
        },
      ),
      RUNS,
    );
  });
});
