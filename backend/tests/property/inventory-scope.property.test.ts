// Prueba de propiedades del alcance de los inventarios médico y de limpieza (tarea 4.10, Property 15).
// Productos de las tres categorías, roles y filtros de categoría al azar (incluido pedir la categoría del
// otro inventario). Se aplica `inventoryScope` y después los filtros de la lista (`productCriteria`).
// El oráculo usa las categorías y roles del diseño, escritos aquí, y comprueba que `can` coincide.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PRODUCT_CATEGORIES, ROLES } from '../../src/domain/constants';
import { applyFilters, productCriteria, type ProductLike } from '../../src/domain/filters';
import { can } from '../../src/domain/permissions';
import { inventoryScope } from '../../src/domain/stock';

const RUNS = { numRuns: 100 };
const AREA = {
  medical: { categories: ['insumo médico', 'medicamento'], readers: ['ADMIN'], resource: 'inventory' },
  cleaning: { categories: ['material de limpieza'], readers: ['ADMIN', 'CLEANING'], resource: 'cleaningInventory' },
} as const;

const productArb: fc.Arbitrary<ProductLike> = fc.record({
  name: fc.string({ maxLength: 8 }),
  category: fc.constantFrom(...PRODUCT_CATEGORIES),
  classification: fc.constant('x'),
  quantity: fc.integer({ min: 0, max: 50 }),
  minStock: fc.integer({ min: 0, max: 50 }),
  supplierId: fc.integer({ min: 1, max: 3 }),
});

describe('Alcance de los inventarios (propiedades)', () => {
  // Feature: hospital-management-system, Property 15: Alcance de los inventarios médico y de limpieza
  it('Property 15: el Módulo_Inventario solo devuelve insumos y medicamentos, el de limpieza solo material de limpieza aunque el filtro pida otra categoría; CLEANING solo lee el segundo y DOCTOR y NURSE ninguno', () => {
    fc.assert(
      fc.property(
        fc.array(productArb, { maxLength: 15 }),
        fc.constantFrom(...ROLES),
        fc.constantFrom('medical', 'cleaning'),
        fc.option(fc.constantFrom(...PRODUCT_CATEGORIES), { nil: undefined }),
        (products, role, area, category) => {
          const spec = AREA[area];
          const canRead = (spec.readers as readonly string[]).includes(role);
          const scoped = inventoryScope(role, products, area);
          expect(can(role, spec.resource, 'list')).toBe(canRead);
          expect(can(role, spec.resource, 'read')).toBe(canRead);
          if (role === 'CLEANING') for (const action of ['create', 'update', 'delete'] as const) expect(can(role, spec.resource, action)).toBe(false);
          if (!canRead) {
            expect(scoped).toBe('DENIED');
            return;
          }
          if (scoped === 'DENIED') throw new Error('no debía denegarse');
          const listed = applyFilters(scoped, productCriteria({ category }));
          const expectedList = products.filter(
            (p) => (spec.categories as readonly string[]).includes(p.category) && (category === undefined || p.category === category),
          );
          expect(listed).toEqual(expectedList);
          for (const p of listed) expect(spec.categories as readonly string[]).toContain(p.category);
        },
      ),
      RUNS,
    );
  });
});
