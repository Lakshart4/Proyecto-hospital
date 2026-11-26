// Pruebas de los filtros puros (tarea 3.5).
// La propiedad "los filtros se combinan con AND" (Property 6) corresponde a la tarea 3.7.

import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  dateRange,
  equals,
  isActive,
  isControlledMedication,
  movementCriteria,
  productCriteria,
  search,
  type MovementLike,
  type ProductLike,
} from '../../src/domain/filters';

interface Person {
  id: number;
  name: string;
  internalId: string;
  role: string;
  departmentId: number | null;
  active: boolean;
  startedAt: Date | null;
}

const people: Person[] = [
  { id: 1, name: 'Ángela Ruiz', internalId: 'EMP-001', role: 'DOCTOR', departmentId: 1, active: true, startedAt: new Date('2026-01-10T08:00:00Z') },
  { id: 2, name: 'Íñigo Peña', internalId: 'EMP-002', role: 'NURSE', departmentId: 2, active: false, startedAt: new Date('2026-01-11T23:59:59Z') },
  { id: 3, name: 'Luis Ortega', internalId: 'enf-010', role: 'NURSE', departmentId: 1, active: true, startedAt: null },
  { id: 4, name: 'María Gómez', internalId: 'EMP-004', role: 'CLEANING', departmentId: null, active: true, startedAt: new Date('2026-01-12T00:00:00Z') },
];
const ids = (rows: { id: number }[]) => rows.map((row) => row.id);

describe('applyFilters', () => {
  it('sin filtros devuelve todos los elementos, en el mismo orden y sin modificar la entrada', () => {
    const copy = structuredClone(people);
    const result = applyFilters(people, []);
    expect(ids(result)).toEqual([1, 2, 3, 4]);
    expect(result).not.toBe(people);
    expect(people).toEqual(copy);
  });

  it('los filtros no indicados (undefined, búsqueda vacía o con espacios) no restringen', () => {
    const criteria = [
      equals((p: Person) => p.role, undefined),
      search((p: Person) => [p.name], '   '),
      search((p: Person) => [p.name], ''),
      dateRange((p: Person) => p.startedAt, {}),
    ];
    expect(criteria.map(isActive)).toEqual([false, false, false, false]);
    expect(ids(applyFilters(people, criteria))).toEqual([1, 2, 3, 4]);
  });

  it('combina los filtros con AND', () => {
    expect(ids(applyFilters(people, [equals((p: Person) => p.role, 'NURSE')]))).toEqual([2, 3]);
    expect(ids(applyFilters(people, [equals((p: Person) => p.departmentId, 1)]))).toEqual([1, 3]);
    expect(
      ids(applyFilters(people, [equals((p: Person) => p.role, 'NURSE'), equals((p: Person) => p.departmentId, 1)])),
    ).toEqual([3]);
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(applyFilters(people, [equals((p: Person) => p.role, 'ADMIN')])).toEqual([]);
    expect(
      applyFilters(people, [equals((p: Person) => p.role, 'DOCTOR'), equals((p: Person) => p.departmentId, 2)]),
    ).toEqual([]);
    expect(applyFilters([], [equals((p: Person) => p.role, 'DOCTOR')])).toEqual([]);
  });

  it('un filtro booleano en false se aplica (no se confunde con "no indicado")', () => {
    expect(ids(applyFilters(people, [equals((p: Person) => p.active, false)]))).toEqual([2]);
  });

  it('un valor nulo del elemento no cumple un filtro de igualdad activo', () => {
    expect(ids(applyFilters(people, [equals((p: Person) => p.departmentId, 2)]))).toEqual([2]);
  });
});

describe('search', () => {
  const byNameOrId = (term: string) => ids(applyFilters(people, [search((p: Person) => [p.name, p.internalId], term)]));

  it('no distingue mayúsculas, incluidas letras acentuadas y la ñ', () => {
    expect(byNameOrId('ÁNGELA')).toEqual([1]);
    expect(byNameOrId('ángela')).toEqual([1]);
    expect(byNameOrId('ÍÑIGO')).toEqual([2]);
    expect(byNameOrId('peña')).toEqual([2]);
  });

  it('busca en cualquiera de los campos indicados y por coincidencia parcial', () => {
    expect(byNameOrId('emp-00')).toEqual([1, 2, 4]);
    expect(byNameOrId('ENF')).toEqual([3]);
    expect(byNameOrId('ort')).toEqual([3]);
  });

  it('recorta el término y devuelve vacío si nada coincide', () => {
    expect(byNameOrId('  gómez  ')).toEqual([4]);
    expect(byNameOrId('zzz')).toEqual([]);
  });

  it('ignora los campos nulos o ausentes', () => {
    const rows = [{ id: 1, tradeName: null as string | null }, { id: 2, tradeName: 'Paracetamol' }];
    expect(ids(applyFilters(rows, [search((r) => [r.tradeName], 'para')]))).toEqual([2]);
  });
});

describe('dateRange', () => {
  const started = (range: { from?: Date; to?: Date }) => ids(applyFilters(people, [dateRange((p: Person) => p.startedAt, range)]));

  it('incluye ambos extremos por día natural UTC, sin importar la hora', () => {
    expect(started({ from: new Date('2026-01-11T00:00:00Z'), to: new Date('2026-01-11T00:00:00Z') })).toEqual([2]);
    expect(started({ from: new Date('2026-01-10T23:00:00Z'), to: new Date('2026-01-12T00:00:00Z') })).toEqual([1, 2, 4]);
  });

  it('acepta solo el inicio o solo el fin', () => {
    expect(started({ from: new Date('2026-01-11T12:00:00Z') })).toEqual([2, 4]);
    expect(started({ to: new Date('2026-01-11T00:00:00Z') })).toEqual([1, 2]);
  });

  it('excluye los elementos sin fecha cuando el rango está activo', () => {
    expect(started({ from: new Date('2000-01-01T00:00:00Z') })).not.toContain(3);
  });

  it('un rango invertido no devuelve nada', () => {
    expect(started({ from: new Date('2026-01-12T00:00:00Z'), to: new Date('2026-01-10T00:00:00Z') })).toEqual([]);
  });

  it('rechaza un extremo con fecha inválida', () => {
    expect(() => dateRange((p: Person) => p.startedAt, { from: new Date('no es fecha') })).toThrow(RangeError);
  });
});

describe('productCriteria', () => {
  const med = (type: string, controlClass: string, requiresPrescription: boolean) => ({ type, controlClass, requiresPrescription });
  const products: (ProductLike & { id: number })[] = [
    { id: 1, name: 'Jeringa 5 ml', category: 'insumo médico', classification: 'jeringa', quantity: 0, minStock: 10, supplierId: 1, medicationInfo: null },
    { id: 2, name: 'Sonda Foley', category: 'insumo médico', classification: 'sonda', quantity: 50, minStock: 10, supplierId: 2 },
    { id: 3, name: 'Paracetamol 500 mg', category: 'medicamento', classification: 'genérico', quantity: 100, minStock: 20, supplierId: 1, medicationInfo: med('genérico', 'venta libre', false) },
    { id: 4, name: 'Morfina 10 mg', category: 'medicamento', classification: 'de patente', quantity: 5, minStock: 5, supplierId: 3, medicationInfo: med('de patente', 'controlado', true) },
    { id: 5, name: 'Amoxicilina', category: 'medicamento', classification: 'genérico', quantity: 30, minStock: 10, supplierId: 2, medicationInfo: med('genérico', 'receta simple', true) },
    { id: 6, name: 'Cloro', category: 'material de limpieza', classification: 'desinfectante', quantity: 3, minStock: 5, supplierId: 4 },
  ];
  const find = (filters: Parameters<typeof productCriteria>[0]) => ids(applyFilters(products, productCriteria(filters)));

  it('sin filtros devuelve todos los productos', () => {
    expect(find({})).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('filtra por categoría, Proveedor y búsqueda por nombre', () => {
    expect(find({ category: 'medicamento' })).toEqual([3, 4, 5]);
    expect(find({ supplierId: 1 })).toEqual([1, 3]);
    expect(find({ search: 'MORF' })).toEqual([4]);
  });

  it('la subcategoría solo la cumplen los insumos médicos', () => {
    expect(find({ subcategory: 'sonda' })).toEqual([2]);
    expect(find({ subcategory: 'genérico' })).toEqual([]);
  });

  it('calcula disponibilidad y Stock_Bajo a partir de la cantidad', () => {
    expect(find({ availability: 'agotado' })).toEqual([1]);
    expect(find({ availability: 'disponible' })).toEqual([2, 3, 4, 5, 6]);
    expect(find({ lowStock: true })).toEqual([1, 4, 6]);
    expect(find({ lowStock: false })).toEqual([2, 3, 5]);
  });

  it('los filtros de medicamento solo devuelven medicamentos', () => {
    expect(find({ medicationType: 'genérico' })).toEqual([3, 5]);
    expect(find({ controlClass: 'controlado' })).toEqual([4]);
    expect(find({ requiresPrescription: true })).toEqual([4, 5]);
    expect(find({ requiresPrescription: false })).toEqual([3]);
    expect(find({ controlled: true })).toEqual([4]);
    expect(find({ controlled: false })).toEqual([3, 5]);
  });

  it('combina filtros del Req. 7 y del Req. 22 con AND', () => {
    expect(find({ category: 'medicamento', requiresPrescription: true, lowStock: true })).toEqual([4]);
    expect(find({ supplierId: 2, medicationType: 'genérico', controlled: false })).toEqual([5]);
    expect(find({ category: 'insumo médico', controlled: true })).toEqual([]);
  });

  it('isControlledMedication sigue la definición del glosario', () => {
    expect(products.filter(isControlledMedication).map((p) => p.id)).toEqual([4]);
  });
});

describe('movementCriteria', () => {
  const movements: (MovementLike & { id: number })[] = [
    { id: 1, productId: 3, type: 'entrada', userId: 1, createdAt: new Date('2026-03-01T10:00:00Z'), product: { category: 'medicamento' } },
    { id: 2, productId: 6, type: 'salida', userId: 2, createdAt: new Date('2026-03-02T23:30:00Z'), product: { category: 'material de limpieza' } },
    { id: 3, productId: 3, type: 'ajuste', userId: 2, createdAt: new Date('2026-03-03T00:00:00Z'), product: { category: 'medicamento' } },
    { id: 4, productId: 1, type: 'salida', userId: 1, createdAt: new Date('2026-03-05T12:00:00Z'), product: { category: 'insumo médico' } },
  ];
  const find = (filters: Parameters<typeof movementCriteria>[0]) => ids(applyFilters(movements, movementCriteria(filters)));

  it('sin filtros devuelve todos los movimientos de ambos inventarios', () => {
    expect(find({})).toEqual([1, 2, 3, 4]);
  });

  it('filtra por Producto, categoría, tipo y usuario', () => {
    expect(find({ productId: 3 })).toEqual([1, 3]);
    expect(find({ category: 'material de limpieza' })).toEqual([2]);
    expect(find({ type: 'salida' })).toEqual([2, 4]);
    expect(find({ userId: 2 })).toEqual([2, 3]);
  });

  it('filtra por rango de fechas inclusivo', () => {
    expect(find({ from: new Date('2026-03-02T00:00:00Z'), to: new Date('2026-03-03T00:00:00Z') })).toEqual([2, 3]);
    expect(find({ from: new Date('2026-03-05T00:00:00Z') })).toEqual([4]);
  });

  it('combina todos los filtros con AND y devuelve vacío si nada coincide', () => {
    expect(find({ productId: 3, type: 'ajuste', userId: 2, from: new Date('2026-03-03T00:00:00Z') })).toEqual([3]);
    expect(find({ productId: 3, type: 'salida' })).toEqual([]);
  });
});
