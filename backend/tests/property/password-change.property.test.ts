// Prueba de propiedades de la validación de cambio y restablecimiento de contraseña (tarea 4.21, Property 3).
//
// Contraseña actual al azar (con su hash bcrypt de costo 4), contraseña presentada igual o distinta y
// contraseña nueva con longitudes en los límites (0, 7, 8, 9, 127, 128, 129, 200), al azar, con espacios
// al principio o al final, con caracteres de varios bytes, o que no es texto. El oráculo usa la longitud
// en unidades de String (como zod) y no llama a las funciones de dominio.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BCRYPT_TEST_COST,
  evaluatePasswordChange,
  evaluatePasswordReset,
  hashPassword,
  verifyPassword,
} from '../../src/lib/password';

const RUNS = { numRuns: 100 };

const lengthOk = (value: unknown) => typeof value === 'string' && value.length >= 8 && value.length <= 128;

const newPasswordArb: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: fc.constantFrom(0, 1, 7, 8, 9, 64, 127, 128, 129, 200).chain((n) => fc.string({ minLength: n, maxLength: n })), weight: 4 },
  fc.string({ maxLength: 200 }),
  fc.string({ unit: 'binary', maxLength: 140 }),
  // Espacios en los extremos cerca de los límites: la longitud cuenta los espacios.
  fc.tuple(fc.constantFrom(5, 6, 7, 126, 127, 128), fc.constantFrom(' ', '  ', '\t')).chain(([n, ws]) =>
    fc.string({ minLength: n, maxLength: n }).map((s) => (n % 2 === 0 ? ws + s : s + ws)),
  ),
  fc.constantFrom(undefined, null, 12345678, true, ['abcdefgh']),
);

describe('Cambio y restablecimiento de contraseña (propiedades)', () => {
  // Feature: hospital-management-system, Property 3: Validación de cambio y restablecimiento de contraseña
  it('Property 3: el cambio se acepta si y solo si la actual coincide y la nueva tiene de 8 a 128 caracteres; el restablecimiento solo exige la longitud; al rechazar el hash no cambia', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 40 }),
        fc.oneof(fc.constant<'same'>('same'), fc.string({ maxLength: 40 }), fc.constant(undefined)),
        newPasswordArb,
        async (current, presentedChoice, newPassword) => {
          const presented = presentedChoice === 'same' ? current : presentedChoice;
          const currentMatches = presented === current;
          const currentHash = await hashPassword(current, BCRYPT_TEST_COST);

          // Cambio.
          const change = await evaluatePasswordChange({ currentHash, currentPassword: presented, newPassword, cost: BCRYPT_TEST_COST });
          const expectChange = currentMatches && lengthOk(newPassword);
          expect(change.ok).toBe(expectChange);
          if (change.ok) {
            expect(change.hash).not.toBe(currentHash);
            expect(await verifyPassword(newPassword as string, change.hash)).toBe(true);
          } else {
            expect(change.hash).toBe(currentHash);
            const fields = change.errors.map((e) => e.field);
            expect(fields).toEqual([...(currentMatches ? [] : ['currentPassword']), ...(lengthOk(newPassword) ? [] : ['newPassword'])]);
            for (const error of change.errors) expect(error.message.length).toBeGreaterThan(0);
          }

          // Restablecimiento.
          const reset = await evaluatePasswordReset({ currentHash, newPassword, cost: BCRYPT_TEST_COST });
          expect(reset.ok).toBe(lengthOk(newPassword));
          if (reset.ok) {
            expect(await verifyPassword(newPassword as string, reset.hash)).toBe(true);
          } else {
            expect(reset.hash).toBe(currentHash);
            expect(reset.errors.map((e) => e.field)).toEqual(['newPassword']);
          }

          // El hash original sigue verificando la contraseña actual.
          expect(await verifyPassword(current, currentHash)).toBe(true);
        },
      ),
      RUNS,
    );
  });
});
