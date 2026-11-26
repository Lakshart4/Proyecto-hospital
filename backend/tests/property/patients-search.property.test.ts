// Prueba de propiedades de búsqueda y orden de Pacientes (tarea 3.14, Property 11).
//
// Se generan listas de Pacientes con nombres que mezclan mayúsculas, tildes y ñ, fechas de ingreso con
// empates frecuentes, y términos de búsqueda tomados de nombres o ID internos existentes con las
// mayúsculas cambiadas, al azar, vacíos o con espacios. El oráculo es independiente de la implementación:
// compara en mayúsculas con toUpperCase sobre "nombre apellidos" e ID interno (nombre buscado según la
// decisión aprobada en la tarea 3.12), y el orden se comprueba sin reordenar: fechas no crecientes y,
// en los empates, el mismo orden relativo que en la entrada.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { searchPatients } from '../../src/domain/patients';

const RUNS = { numRuns: 100 };

const LETTERS = ['a', 'A', 'á', 'Á', 'e', 'É', 'i', 'Í', 'n', 'Ñ', 'ñ', 'o', 'Ó', 'r', 'R', 'u', 'Ü', ' '];
const wordArb = fc.array(fc.constantFrom(...LETTERS), { minLength: 1, maxLength: 6 }).map((c) => c.join(''));
const DAY = 86_400_000;

const patientsArb = fc
  .array(
    fc.record({
      firstName: wordArb,
      lastName: wordArb,
      internalId: fc.tuple(fc.constantFrom('PAC', 'urg', 'Ped'), fc.integer({ min: 0, max: 99 })).map(([p, n]) => `${p}-${String(n).padStart(3, '0')}`),
      // Solo 6 fechas posibles: los empates son frecuentes.
      admissionDate: fc.integer({ min: 0, max: 5 }).map((d) => new Date(Date.UTC(2026, 0, 1) + d * DAY)),
    }),
    { maxLength: 25 },
  )
  .map((list) => list.map((p, id) => ({ id, ...p })));

type Patient = { id: number; firstName: string; lastName: string; internalId: string; admissionDate: Date };

const flipCase = (c: string) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());

/** Término: fragmento de un texto existente con mayúsculas cambiadas, texto al azar, vacío o con espacios. */
function termArb(patients: Patient[]): fc.Arbitrary<string | undefined> {
  const texts = patients.flatMap((p) => [`${p.firstName} ${p.lastName}`, p.internalId]).filter((t) => t.trim() !== '');
  const options: fc.Arbitrary<string | undefined>[] = [fc.constant(undefined), fc.constantFrom('', '   '), wordArb];
  if (texts.length > 0) {
    options.push(
      fc
        .tuple(fc.constantFrom(...texts), fc.nat(), fc.nat({ max: 4 }), fc.array(fc.boolean(), { minLength: 6, maxLength: 6 }))
        .map(([text, start, length, flips]) => {
          const from = start % text.length;
          return [...text.slice(from, from + 1 + length)].map((c, k) => (flips[k] ? flipCase(c) : c)).join('');
        }),
    );
  }
  return fc.oneof(...options);
}

const scenarioArb = patientsArb.chain((patients) => termArb(patients).map((term) => ({ patients, term })));

describe('Búsqueda de Pacientes (propiedades)', () => {
  // Feature: hospital-management-system, Property 11: Búsqueda y orden de Pacientes
  it('Property 11: resultados exactos por nombre o ID interno, sin distinguir mayúsculas, ordenados por ingreso descendente', () => {
    fc.assert(
      fc.property(scenarioArb, ({ patients, term }) => {
        const before = structuredClone(patients);
        const result = searchPatients(patients, term);

        // Exactamente los que coinciden (un término vacío o con solo espacios no filtra).
        const needle = term === undefined || term.trim() === '' ? null : term.trim().toUpperCase();
        const matches = (p: Patient) =>
          needle === null || `${p.firstName} ${p.lastName}`.toUpperCase().includes(needle) || p.internalId.toUpperCase().includes(needle);
        const expectedIds = patients.filter(matches).map((p) => p.id);
        expect(result.map((p) => p.id).sort((a, b) => a - b)).toEqual(expectedIds);

        // Orden: fechas de ingreso no crecientes; en los empates, el orden de entrada (ids crecientes).
        for (let i = 1; i < result.length; i++) {
          const prev = result[i - 1] as Patient;
          const curr = result[i] as Patient;
          expect(prev.admissionDate.getTime()).toBeGreaterThanOrEqual(curr.admissionDate.getTime());
          if (prev.admissionDate.getTime() === curr.admissionDate.getTime()) expect(prev.id).toBeLessThan(curr.id);
        }

        // Función pura: la entrada no cambia.
        expect(patients).toEqual(before);
      }),
      RUNS,
    );
  });
});
