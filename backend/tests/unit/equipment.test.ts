// Pruebas de las reglas puras de equipos y mantenimiento (tarea 3.18, Req. 26.3, 26.7).
// Las propiedades 23 y 24 corresponden a las tareas 3.19 y 3.20.

import { describe, expect, it } from 'vitest';
import { canOpenMaintenance, equipmentSummary } from '../../src/domain/equipment';

describe('equipmentSummary', () => {
  const items = [
    { category: 'Monitor', departmentId: 1, quantity: 4 },
    { category: 'Desfibrilador', departmentId: 2, quantity: 1 },
    { category: 'Monitor', departmentId: 2, quantity: 3 },
    { category: 'Monitor', departmentId: 1, quantity: 2 },
    { category: 'Ventilador', departmentId: 1, quantity: 9999 },
  ];

  it('suma cantidades por categoría y Departamento, con totales y total general', () => {
    expect(equipmentSummary(items)).toEqual({
      cells: [
        { category: 'Desfibrilador', departmentId: 2, quantity: 1 },
        { category: 'Monitor', departmentId: 1, quantity: 6 },
        { category: 'Monitor', departmentId: 2, quantity: 3 },
        { category: 'Ventilador', departmentId: 1, quantity: 9999 },
      ],
      byCategory: [
        { category: 'Desfibrilador', quantity: 1 },
        { category: 'Monitor', quantity: 9 },
        { category: 'Ventilador', quantity: 9999 },
      ],
      byDepartment: [
        { departmentId: 1, quantity: 10_005 },
        { departmentId: 2, quantity: 4 },
      ],
      total: 10_009,
    });
  });

  it('el total general es la suma de todas las cantidades y de cada lista de totales', () => {
    const summary = equipmentSummary(items);
    const sum = (list: { quantity: number }[]) => list.reduce((acc, x) => acc + x.quantity, 0);
    expect(summary.total).toBe(sum(items));
    expect(sum(summary.cells)).toBe(summary.total);
    expect(sum(summary.byCategory)).toBe(summary.total);
    expect(sum(summary.byDepartment)).toBe(summary.total);
  });

  it('una categoría que solo difiere en mayúsculas cuenta como otra categoría', () => {
    const summary = equipmentSummary([
      { category: 'Monitor', departmentId: 1, quantity: 1 },
      { category: 'monitor', departmentId: 1, quantity: 1 },
    ]);
    expect(summary.cells).toHaveLength(2);
  });

  it('sin equipos devuelve listas vacías y total 0', () => {
    expect(equipmentSummary([])).toEqual({ cells: [], byCategory: [], byDepartment: [], total: 0 });
  });

  it('no modifica la lista recibida', () => {
    const copy = structuredClone(items);
    equipmentSummary(items);
    expect(items).toEqual(copy);
  });

  it.each([0, -1, 10_000, 1.5, Number.NaN])('lanza RangeError con la cantidad %s', (quantity) => {
    expect(() => equipmentSummary([{ category: 'Monitor', departmentId: 1, quantity }])).toThrow(RangeError);
  });
});

describe('canOpenMaintenance', () => {
  it('permite abrir un mantenimiento solo si no hay ninguno en curso', () => {
    expect(canOpenMaintenance(0)).toBe(true);
    expect(canOpenMaintenance(1)).toBe(false);
    expect(canOpenMaintenance(2)).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])('lanza RangeError con %s registros en curso', (open) => {
    expect(() => canOpenMaintenance(open)).toThrow(RangeError);
  });
});
