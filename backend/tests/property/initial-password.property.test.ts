// Prueba de propiedades de contraseñas iniciales únicas (tarea 6.2, Property 8; Req. 5.12, 14.5).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIGITS, generateInitialPassword, INITIAL_PASSWORD_LENGTH, LOWERCASE, UPPERCASE } from '../../src/lib/initial-password';

const RUNS = { numRuns: 100 };
const ALLOWED_ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

describe('Contraseñas iniciales (propiedades)', () => {
  // Feature: hospital-management-system, Property 8: Contraseñas iniciales únicas
  it('Property 8: para todo conjunto de N contraseñas iniciales generadas, todas son distintas y tienen longitud en [8, 128]', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 30 }), (count) => {
        const passwords = Array.from({ length: count }, () => generateInitialPassword());
        expect(new Set(passwords).size).toBe(count);
        for (const password of passwords) {
          expect(password.length).toBeGreaterThanOrEqual(8);
          expect(password.length).toBeLessThanOrEqual(128);
          expect(password.length).toBe(INITIAL_PASSWORD_LENGTH);
          expect(password).toMatch(/[A-Z]/);
          expect(password).toMatch(/[a-z]/);
          expect(password).toMatch(/\d/);
          expect(password).not.toMatch(/[Il1Oo0]/);
          expect([...password].every((char) => ALLOWED_ALPHABET.includes(char))).toBe(true);
        }
      }),
      RUNS,
    );
  });
});
