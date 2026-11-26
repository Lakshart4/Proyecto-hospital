// Prueba de propiedades del resumen de equipamiento (tarea 3.19, Property 23).
//
// Se generan listas de Equipos con categorías repetidas (incluidas variantes que solo difieren en
// mayúsculas, que cuentan como categorías distintas), Departamentos 1 a 4 y cantidades de 1 a 9999 con
// los límites frecuentes. El oráculo agrupa con objetos anidados y compara sin depender del orden.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { equipmentSummary } from '../../src/domain/equipment';

const RUNS = { numRuns: 100 };

const itemsArb = fc.array(
  fc.record({
    category: fc.constantFrom('Monitor', 'monitor', 'Desfibrilador', 'Ventilador', 'Bomba de infusión', 'Ecógrafo'),
    departmentId: fc.integer({ min: 1, max: 4 }),
    quantity: fc.oneof(fc.constantFrom(1, 9999), fc.integer({ min: 1, max: 9999 })),
  }),
  { maxLength: 40 },
);

const sum = (list: readonly { quantity: number }[]) => list.reduce((acc, x) => acc + x.quantity, 0);

describe('Resumen de equipamiento (propiedades)', () => {
  // Feature: hospital-management-system, Property 23: Resumen de equipamiento
  it('Property 23: suma por (categoría, Departamento), totales que suman sus celdas y total general', () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const before = structuredClone(items);
        const summary = equipmentSummary(items);

        // Oráculo: suma por categoría y Departamento con objetos anidados.
        const grid: Record<string, Record<number, number>> = {};
        for (const item of items) {
          grid[item.category] ??= {};
          const row = grid[item.category] as Record<number, number>;
          row[item.departmentId] = (row[item.departmentId] ?? 0) + item.quantity;
        }
        const expectedCells = Object.entries(grid).flatMap(([category, row]) =>
          Object.entries(row).map(([departmentId, quantity]) => ({ category, departmentId: Number(departmentId), quantity })),
        );
        const key = (c: { category: string; departmentId: number }) => `${c.category}|${c.departmentId}`;
        const byKey = (list: { category: string; departmentId: number; quantity: number }[]) =>
          Object.fromEntries(list.map((c) => [key(c), c.quantity]));

        // Celdas: exactamente una por combinación presente, con la suma de sus cantidades.
        expect(summary.cells).toHaveLength(expectedCells.length);
        expect(byKey(summary.cells)).toEqual(byKey(expectedCells));

        // Cada total por categoría y por Departamento es la suma de sus celdas.
        const categories = Object.keys(grid);
        expect(summary.byCategory.map((c) => c.category).sort()).toEqual([...categories].sort());
        for (const c of summary.byCategory) expect(c.quantity).toBe(sum(summary.cells.filter((cell) => cell.category === c.category)));
        const departments = [...new Set(items.map((i) => i.departmentId))];
        expect(summary.byDepartment.map((d) => d.departmentId).sort((a, b) => a - b)).toEqual(departments.sort((a, b) => a - b));
        for (const d of summary.byDepartment) expect(d.quantity).toBe(sum(summary.cells.filter((cell) => cell.departmentId === d.departmentId)));

        // Total general: la suma de todas las cantidades.
        expect(summary.total).toBe(sum(items));
        expect(sum(summary.byCategory)).toBe(summary.total);
        expect(sum(summary.byDepartment)).toBe(summary.total);

        expect(items).toEqual(before);
      }),
      RUNS,
    );
  });
});
