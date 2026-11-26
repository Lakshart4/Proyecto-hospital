// Pruebas de las reglas de stock e inventarios (tarea 3.5, Req. 7.3, 7.4, 7.9, 7.10, 23.2, 23.5).
// Las propiedades de stock (Property 14) corresponden a la tarea 3.6.

import { describe, expect, it } from 'vitest';
import { ROLES } from '../../src/domain/constants';
import { applyFilters, productCriteria } from '../../src/domain/filters';
import { availabilityOf, inventoryScope, isLowStock } from '../../src/domain/stock';

describe('isLowStock', () => {
  it('es verdadero si la cantidad es menor o igual que el Stock_Mínimo', () => {
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(4, 5)).toBe(true);
    expect(isLowStock(0, 0)).toBe(true);
    expect(isLowStock(0, 10)).toBe(true);
  });

  it('es falso si la cantidad supera el Stock_Mínimo', () => {
    expect(isLowStock(6, 5)).toBe(false);
    expect(isLowStock(1, 0)).toBe(false);
    expect(isLowStock(999_999, 999_998)).toBe(false);
  });

  it.each([
    [-1, 5],
    [5, -1],
    [1.5, 5],
    [5, Number.NaN],
    [Number.POSITIVE_INFINITY, 5],
  ])('rechaza valores que no son enteros no negativos (%s, %s)', (quantity, minStock) => {
    expect(() => isLowStock(quantity, minStock)).toThrow(RangeError);
  });
});

describe('availabilityOf', () => {
  it('es "agotado" con cantidad cero y "disponible" con cualquier cantidad positiva', () => {
    expect(availabilityOf(0)).toBe('agotado');
    expect(availabilityOf(1)).toBe('disponible');
    expect(availabilityOf(999_999)).toBe('disponible');
  });

  it('rechaza cantidades negativas o no enteras', () => {
    expect(() => availabilityOf(-1)).toThrow(RangeError);
    expect(() => availabilityOf(0.5)).toThrow(RangeError);
  });
});

describe('inventoryScope', () => {
  const products = [
    { id: 1, category: 'insumo médico' },
    { id: 2, category: 'medicamento' },
    { id: 3, category: 'material de limpieza' },
    { id: 4, category: 'medicamento' },
    { id: 5, category: 'material de limpieza' },
  ];
  const ids = (result: { id: number }[] | 'DENIED') => (result === 'DENIED' ? result : result.map((p) => p.id));

  it('el Módulo_Inventario devuelve solo insumos médicos y medicamentos al Administrador', () => {
    expect(ids(inventoryScope('ADMIN', products, 'medical'))).toEqual([1, 2, 4]);
  });

  it('el Módulo_Inventario_Limpieza devuelve solo material de limpieza a ADMIN y CLEANING', () => {
    expect(ids(inventoryScope('ADMIN', products, 'cleaning'))).toEqual([3, 5]);
    expect(ids(inventoryScope('CLEANING', products, 'cleaning'))).toEqual([3, 5]);
  });

  it('niega el Módulo_Inventario a DOCTOR, NURSE y CLEANING', () => {
    for (const role of ['DOCTOR', 'NURSE', 'CLEANING'] as const) {
      expect(inventoryScope(role, products, 'medical')).toBe('DENIED');
    }
  });

  it('niega el Módulo_Inventario_Limpieza a DOCTOR y NURSE', () => {
    expect(inventoryScope('DOCTOR', products, 'cleaning')).toBe('DENIED');
    expect(inventoryScope('NURSE', products, 'cleaning')).toBe('DENIED');
  });

  it('cubre todos los roles definidos', () => {
    const access = ROLES.map((role) => [role, inventoryScope(role, products, 'medical') !== 'DENIED', inventoryScope(role, products, 'cleaning') !== 'DENIED']);
    expect(access).toEqual([
      ['ADMIN', true, true],
      ['DOCTOR', false, false],
      ['NURSE', false, false],
      ['CLEANING', false, true],
    ]);
  });

  it('un filtro de categoría ajena no amplía el alcance del inventario', () => {
    const fullProducts = products.map((p) => ({
      ...p,
      name: `Producto ${p.id}`,
      classification: 'material médico',
      quantity: 10,
      minStock: 1,
      supplierId: 1,
    }));
    const medical = inventoryScope('ADMIN', fullProducts, 'medical');
    const cleaning = inventoryScope('CLEANING', fullProducts, 'cleaning');
    if (medical === 'DENIED' || cleaning === 'DENIED') throw new Error('acceso inesperadamente negado');
    expect(applyFilters(medical, productCriteria({ category: 'material de limpieza' }))).toEqual([]);
    expect(applyFilters(cleaning, productCriteria({ category: 'medicamento' }))).toEqual([]);
  });

  it('no modifica la lista recibida', () => {
    const copy = structuredClone(products);
    inventoryScope('ADMIN', products, 'medical');
    expect(products).toEqual(copy);
  });
});
