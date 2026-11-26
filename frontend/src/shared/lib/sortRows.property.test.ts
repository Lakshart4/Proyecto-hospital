// Prueba de propiedades del ordenamiento de tablas (tarea 5.5, Property 43).
//
// Listas de filas con una columna de números, textos (mayúsculas, acentos, números dentro del texto),
// fechas, booleanos o valores vacíos, con muchos empates. Para cada lista, columna y dirección:
// el resultado es una permutación de la entrada; queda ordenado según un comparador escrito aparte;
// los empates conservan el orden de entrada; las claves en descendente son las de ascendente al revés
// (el reverso salvo empates); y la lista recibida no cambia.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sortRows, type SortValue } from './sortRows';

const RUNS = { numRuns: 100 };

type Row = { id: number; value: SortValue };
const oracleCollator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

/** Comparador del oráculo: vacíos < números < fechas < booleanos < textos. */
function oracleCompare(a: SortValue, b: SortValue): number {
  const kind = (v: SortValue) =>
    v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v)) || (v instanceof Date && Number.isNaN(v.getTime()))
      ? 0
      : typeof v === 'number' ? 1 : v instanceof Date ? 2 : typeof v === 'boolean' ? 3 : 4;
  const [ka, kb] = [kind(a), kind(b)];
  if (ka !== kb) return ka < kb ? -1 : 1;
  if (ka === 0) return 0;
  if (ka === 1 || ka === 2) {
    const [x, y] = [Number(a), Number(b)];
    return x === y ? 0 : x < y ? -1 : 1;
  }
  if (ka === 3) return a === b ? 0 : a ? 1 : -1;
  return Math.sign(oracleCollator.compare(String(a), String(b)));
}

const textArb = fc.oneof(
  fc.constantFrom('ana', 'Ana', 'ÁNA', 'Beto', 'beto', 'Óscar', 'oscar', 'item 2', 'item 10', 'Zoe', ''),
  fc.string({ maxLength: 4 }),
);
const columnArb: fc.Arbitrary<fc.Arbitrary<SortValue>> = fc.constantFrom(
  fc.integer({ min: -20, max: 20 }) as fc.Arbitrary<SortValue>,
  fc.oneof(fc.integer({ min: -3, max: 3 }), fc.double({ min: -100, max: 100, noNaN: true }), fc.constant(null)) as fc.Arbitrary<SortValue>,
  textArb as fc.Arbitrary<SortValue>,
  fc.oneof(fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31'), noInvalidDate: true }), fc.constant(undefined)) as fc.Arbitrary<SortValue>,
  fc.boolean() as fc.Arbitrary<SortValue>,
  fc.oneof(fc.integer({ min: 0, max: 3 }), textArb, fc.boolean(), fc.constant(null)) as fc.Arbitrary<SortValue>,
);
const rowsArb = columnArb.chain((valueArb) =>
  fc.array(valueArb, { maxLength: 30 }).map((values) => values.map((value, id): Row => ({ id, value }))),
);

const EXAMPLES: [Row[], 'asc' | 'desc'][] = [
  [[], 'asc'],
  [[{ id: 0, value: 5 }], 'desc'],
  [[{ id: 0, value: 'b' }, { id: 1, value: 'B' }, { id: 2, value: 'a' }], 'desc'],
  [[{ id: 0, value: 9 }, { id: 1, value: 10 }, { id: 2, value: null }, { id: 3, value: 9 }], 'asc'],
];

describe('Ordenamiento de tablas (propiedades)', () => {
  // Feature: hospital-management-system, Property 43: Ordenamiento de tablas
  it('Property 43: sortRows devuelve una permutación ordenada por la columna en la dirección indicada; descendente es el reverso de ascendente salvo empates', () => {
    fc.assert(
      fc.property(rowsArb, fc.constantFrom<'asc' | 'desc'>('asc', 'desc'), (rows, direction) => {
        const snapshot = rows.map((r) => ({ ...r }));
        const result = sortRows(rows, (r) => r.value, direction);
        const sign = direction === 'asc' ? 1 : -1;

        // Permutación.
        expect(result).toHaveLength(rows.length);
        expect([...result.map((r) => r.id)].sort((a, b) => a - b)).toEqual(rows.map((r) => r.id));
        // Ordenado y estable.
        for (let i = 1; i < result.length; i++) {
          const cmp = sign * oracleCompare(result[i - 1]!.value, result[i]!.value);
          expect(cmp).toBeLessThanOrEqual(0);
          if (cmp === 0) expect(result[i - 1]!.id).toBeLessThan(result[i]!.id);
        }
        // Descendente = reverso de ascendente salvo empates (comparando las claves).
        const asc = sortRows(rows, (r) => r.value, 'asc');
        const desc = sortRows(rows, (r) => r.value, 'desc');
        const reversed = [...asc].reverse();
        desc.forEach((row, i) => expect(oracleCompare(row.value, reversed[i]!.value)).toBe(0));
        // La entrada no cambia.
        expect(rows).toEqual(snapshot);
      }),
      { ...RUNS, examples: EXAMPLES },
    );
  });
});
