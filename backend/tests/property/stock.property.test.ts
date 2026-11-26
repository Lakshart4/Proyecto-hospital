// Prueba de propiedades de stock (tarea 3.6).
// Comprueba isLowStock y availabilityOf contra la definición de Property 14 y, para el Req. 23.4,
// que los filtros de Productos (`lowStock` y `availability`) clasifican igual en cualquier categoría,
// incluido el Módulo_Inventario_Limpieza.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PRODUCT_CATEGORIES } from '../../src/domain/constants';
import { applyFilters, productCriteria, type ProductLike } from '../../src/domain/filters';
import { availabilityOf, isLowStock } from '../../src/domain/stock';

const RUNS = { numRuns: 100 };

/** Límites de cantidad y Stock_Mínimo del modelo de datos, escritos aquí de forma independiente. */
const MIN = 0;
const MAX = 999_999;

const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value));

/**
 * Pares (cantidad, stockMínimo) en [0, 999 999]: aleatorios, alrededor del límite
 * (cantidad = mínimo y ±1) y con los extremos 0 y 999 999.
 */
const pairArb = fc.oneof(
  fc.tuple(fc.integer({ min: MIN, max: MAX }), fc.integer({ min: MIN, max: MAX })),
  fc
    .tuple(fc.integer({ min: MIN, max: MAX }), fc.constantFrom(-1, 0, 1))
    .map(([minStock, delta]) => [clamp(minStock + delta), minStock] as [number, number]),
  fc.tuple(fc.constantFrom(MIN, 1, MAX - 1, MAX), fc.constantFrom(MIN, 1, MAX - 1, MAX)),
);

describe('Stock (propiedades)', () => {
  // Feature: hospital-management-system, Property 14: Stock bajo y agotado
  it('Property 14: isLowStock es verdadero si y solo si cantidad <= stockMínimo, y availabilityOf es agotado si y solo si cantidad = 0', () => {
    fc.assert(
      fc.property(pairArb, fc.constantFrom(...PRODUCT_CATEGORIES), ([quantity, minStock], category) => {
        const low = isLowStock(quantity, minStock);
        const availability = availabilityOf(quantity);

        // Definiciones de la propiedad (Req. 7.3 y 7.4).
        if (quantity <= minStock) expect(low).toBe(true);
        if (quantity > minStock) expect(low).toBe(false);
        if (quantity === 0) expect(availability).toBe('agotado');
        if (quantity > 0) expect(availability).toBe('disponible');

        // Consecuencias: un producto agotado siempre tiene Stock_Bajo; el Stock_Bajo se conserva al
        // bajar la cantidad o subir el mínimo, y desaparece al pasar de mínimo + 1 o más.
        if (availability === 'agotado') expect(low).toBe(true);
        if (low && quantity > MIN) expect(isLowStock(quantity - 1, minStock)).toBe(true);
        if (low && minStock < MAX) expect(isLowStock(quantity, minStock + 1)).toBe(true);
        if (minStock < MAX) expect(isLowStock(minStock + 1, minStock)).toBe(false);
        expect(isLowStock(minStock, minStock)).toBe(true);

        // Req. 23.4: los filtros de Productos aplican las mismas reglas en cualquier categoría.
        const product: ProductLike = {
          name: 'Producto de prueba',
          category,
          classification: 'material médico',
          quantity,
          minStock,
          supplierId: 1,
        };
        const lowFilter = applyFilters([product], productCriteria({ lowStock: true }));
        const notLowFilter = applyFilters([product], productCriteria({ lowStock: false }));
        const soldOutFilter = applyFilters([product], productCriteria({ availability: 'agotado' }));
        const availableFilter = applyFilters([product], productCriteria({ availability: 'disponible' }));
        expect(lowFilter.length).toBe(quantity <= minStock ? 1 : 0);
        expect(notLowFilter.length).toBe(quantity <= minStock ? 0 : 1);
        expect(soldOutFilter.length).toBe(quantity === 0 ? 1 : 0);
        expect(availableFilter.length).toBe(quantity === 0 ? 0 : 1);
      }),
      RUNS,
    );
  });
});
