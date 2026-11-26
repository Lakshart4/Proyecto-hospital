// Prueba de propiedades de los campos editables del Perfil propio (tarea 4.12, Property 7).
// Cuerpos con subconjuntos de las cuatro claves permitidas, a veces con una clave prohibida del
// Req. 5.8 o una clave al azar, y valores que no son objetos (incluido un arreglo vacío). Cada clave
// prohibida y los cuerpos de borde se ejecutan además siempre como ejemplos fijos.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { canEditOwnProfile } from '../../src/domain/permissions';

const RUNS = { numRuns: 100 };
const ALLOWED = ['photoUrl', 'phone', 'password', 'schedule'];
const FORBIDDEN = ['position', 'description', 'email', 'internalId', 'departmentId', 'role', 'yearsExperience', 'shift'];

const bodyArb: fc.Arbitrary<unknown> = fc.oneof(
  { arbitrary: fc.subarray(ALLOWED).map((keys) => Object.fromEntries(keys.map((k) => [k, 'v']))), weight: 3 },
  {
    arbitrary: fc
      .tuple(fc.subarray(ALLOWED), fc.oneof(fc.constantFrom(...FORBIDDEN), fc.string({ minLength: 1, maxLength: 10 })))
      .map(([keys, extra]) => Object.fromEntries([...keys, extra].map((k) => [k, 'v']))),
    weight: 3,
  },
  fc.constantFrom(null, undefined, 'phone', 7, ['phone'], [], true),
);

/** Ejemplos fijos en cada ejecución: cada clave prohibida sola, todas las permitidas y cuerpos que no son objetos. */
const EXAMPLES: [unknown][] = [
  ...FORBIDDEN.map((key): [unknown] => [{ phone: 'v', [key]: 'v' }]),
  [Object.fromEntries(ALLOWED.map((k) => [k, 'v']))],
  [{}],
  [[]],
  [null],
];

describe('Perfil propio (propiedades)', () => {
  // Feature: hospital-management-system, Property 7: Campos editables del Perfil propio
  it('Property 7: el cuerpo se acepta si y solo si todas sus claves son foto, teléfono, contraseña u Horario_de_Trabajo', () => {
    fc.assert(
      fc.property(bodyArb, (body) => {
        const copy = structuredClone(body);
        const isObject = typeof body === 'object' && body !== null && !Array.isArray(body);
        const expected = isObject && Object.keys(body).every((k) => ALLOWED.includes(k));
        expect(canEditOwnProfile(body)).toBe(expected);
        if (isObject && Object.keys(body).some((k) => FORBIDDEN.includes(k))) expect(canEditOwnProfile(body)).toBe(false);
        expect(body).toEqual(copy);
      }),
      { ...RUNS, examples: EXAMPLES },
    );
  });
});
