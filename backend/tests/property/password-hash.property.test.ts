// Prueba de propiedades del hash de contraseña (tarea 4.2, Property 1).
//
// Contraseñas de 0 a 128 caracteres (y algunas más largas) con texto ASCII, Unicode completo y caracteres
// de varios bytes. Para cada una se compara con "otra" contraseña distinta: al azar, con un carácter
// cambiado, con un sufijo, con mayúsculas cambiadas, recortada, o con los mismos primeros 72 bytes (el
// límite de bcrypt) y una diferencia después. bcrypt usa costo 4 (pruebas).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { BCRYPT_TEST_COST, hashPassword, verifyPassword } from '../../src/lib/password';

const RUNS = { numRuns: 100 };

const passwordArb = fc.oneof(
  fc.string({ maxLength: 128 }),
  fc.string({ unit: 'binary', maxLength: 128 }),
  fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }),
  // Largas: superan 72 bytes en UTF-8.
  fc.string({ minLength: 73, maxLength: 128 }),
  fc.string({ unit: 'binary', minLength: 40, maxLength: 128 }),
);

/** Otra contraseña derivada (o al azar); puede coincidir por casualidad y se descarta con fc.pre. */
function otherArb(password: string): fc.Arbitrary<string> {
  const chars = [...password];
  return fc.oneof(
    fc.string({ maxLength: 128 }),
    fc.string({ minLength: 1, maxLength: 3 }).map((suffix) => password + suffix),
    fc.constant(chars.slice(0, -1).join('')),
    fc.constant(password.toUpperCase() === password ? password.toLowerCase() : password.toUpperCase()),
    fc.nat().map((i) => {
      if (chars.length === 0) return 'x';
      const pos = i % chars.length;
      return [...chars.slice(0, pos), chars[pos] === 'a' ? 'b' : 'a', ...chars.slice(pos + 1)].join('');
    }),
    // Mismos primeros 72 bytes o más y diferencia al final.
    fc.constantFrom('1', '2', 'Z').map((tail) => `${password.padEnd(80, 'p')}${tail}`),
  );
}

const pairArb = passwordArb.chain((password) =>
  fc.tuple(fc.constant(password), otherArb(password), fc.constantFrom('1', '2', 'Z')),
);

describe('Hash de contraseña (propiedades)', () => {
  // Feature: hospital-management-system, Property 1: Hash de contraseña
  it('Property 1: el hash difiere del texto plano, verifica la contraseña y no verifica ninguna otra distinta', async () => {
    await fc.assert(
      fc.asyncProperty(pairArb, async ([raw, other, tail]) => {
        // Cuando la contraseña es corta, se alarga a veces para que su variante comparta 72 bytes.
        const password = tail === 'Z' ? raw.padEnd(80, 'p') : raw;
        const different = tail === 'Z' ? `${password}Z` : other;
        fc.pre(different !== password);

        const hash = await hashPassword(password, BCRYPT_TEST_COST);
        expect(hash).not.toBe(password);
        // Una contraseña corta puede aparecer por azar dentro del hash; desde 8 caracteres es prácticamente imposible.
        if (password.length >= 8) expect(hash).not.toContain(password);
        expect(await verifyPassword(password, hash)).toBe(true);
        expect(await verifyPassword(different, hash)).toBe(false);
      }),
      RUNS,
    );
  });
});
