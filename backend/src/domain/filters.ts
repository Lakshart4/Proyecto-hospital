// Filtros puros de listas (Req. 5.3, 6.5, 7.9, 8.6, 9.10, 12.4, 22.6, 24.7, 25.5, 26.6, 27.4).
//
// `applyFilters` devuelve exactamente los elementos que cumplen TODOS los criterios activos (AND),
// conservando el orden de entrada. Un criterio sin valor (filtro no indicado) no restringe nada:
// sin filtros se devuelve todo y, si ninguno coincide, una lista vacía.
// Cada recurso arma sus criterios con `equals`, `search` y `dateRange`; aquí se incluyen además los
// criterios de Productos (con los filtros de medicamento) y de Movimientos_de_Inventario.

import type { ControlClass, ProductAvailability } from './constants';
import { availabilityOf, isLowStock } from './stock';

export type Criterion<T> =
  | { kind: 'equals'; get: (row: T) => unknown; value: unknown }
  | { kind: 'search'; get: (row: T) => ReadonlyArray<string | null | undefined>; term: string | undefined }
  | { kind: 'dateRange'; get: (row: T) => Date | null | undefined; from: Date | undefined; to: Date | undefined };

/** Igualdad exacta con el valor del filtro. Con `value` undefined el criterio no se aplica. */
export function equals<T, V>(get: (row: T) => V | null | undefined, value: V | undefined): Criterion<T> {
  return { kind: 'equals', get, value };
}

/**
 * Búsqueda por texto sin distinguir mayúsculas: el elemento cumple si alguno de los campos contiene
 * el término. El término se recorta; vacío o con solo espacios, el criterio no se aplica.
 */
export function search<T>(get: (row: T) => ReadonlyArray<string | null | undefined>, term: string | undefined): Criterion<T> {
  return { kind: 'search', get, term };
}

export interface DateRange {
  from?: Date | undefined;
  to?: Date | undefined;
}

/**
 * Rango de fechas inclusivo por día natural (UTC, como se guardan las fechas): el elemento cumple si
 * su fecha cae entre el día de `from` y el día de `to`, ambos incluidos, sin importar la hora.
 * Cada extremo es opcional; sin ninguno el criterio no se aplica. Un elemento sin fecha no cumple
 * un rango activo.
 */
export function dateRange<T>(get: (row: T) => Date | null | undefined, range: DateRange): Criterion<T> {
  for (const bound of [range.from, range.to]) {
    if (bound !== undefined && Number.isNaN(bound.getTime())) throw new RangeError('Fecha de filtro inválida.');
  }
  return { kind: 'dateRange', get, from: range.from, to: range.to };
}

const normalizeText = (text: string) => text.trim().toLocaleLowerCase('es');

/** Día natural en UTC como número comparable AAAAMMDD. */
const utcDay = (date: Date) => date.getUTCFullYear() * 10_000 + (date.getUTCMonth() + 1) * 100 + date.getUTCDate();

/** Indica si el criterio restringe la lista (es decir, si el filtro fue indicado). */
export function isActive<T>(criterion: Criterion<T>): boolean {
  switch (criterion.kind) {
    case 'equals':
      return criterion.value !== undefined;
    case 'search':
      return criterion.term !== undefined && normalizeText(criterion.term) !== '';
    case 'dateRange':
      return criterion.from !== undefined || criterion.to !== undefined;
  }
}

function matches<T>(criterion: Criterion<T>, row: T): boolean {
  switch (criterion.kind) {
    case 'equals':
      return criterion.get(row) === criterion.value;
    case 'search': {
      const term = normalizeText(criterion.term ?? '');
      return criterion.get(row).some((field) => typeof field === 'string' && field.toLocaleLowerCase('es').includes(term));
    }
    case 'dateRange': {
      const value = criterion.get(row);
      if (!(value instanceof Date) || Number.isNaN(value.getTime())) return false;
      const day = utcDay(value);
      if (criterion.from !== undefined && day < utcDay(criterion.from)) return false;
      if (criterion.to !== undefined && day > utcDay(criterion.to)) return false;
      return true;
    }
  }
}

/** Elementos que cumplen todos los criterios activos, en el mismo orden de entrada. */
export function applyFilters<T>(rows: readonly T[], criteria: ReadonlyArray<Criterion<T>>): T[] {
  const active = criteria.filter(isActive);
  return rows.filter((row) => active.every((criterion) => matches(criterion, row)));
}

// ---------- Productos (Req. 7.9, 22.6) ----------

/** Clasificación de control que define un Medicamento_Controlado (glosario). */
export const CONTROLLED_CONTROL_CLASS = 'controlado' satisfies ControlClass;

export interface MedicationInfoLike {
  type: string;
  controlClass: string;
  requiresPrescription: boolean;
}

export interface ProductLike {
  name: string;
  category: string;
  /** Subcategoría_de_Insumo en los insumos médicos. */
  classification: string;
  quantity: number;
  minStock: number;
  supplierId: number;
  medicationInfo?: MedicationInfoLike | null;
}

export interface ProductFilters {
  category?: string;
  subcategory?: string;
  availability?: ProductAvailability;
  lowStock?: boolean;
  supplierId?: number;
  medicationType?: string;
  controlClass?: string;
  requiresPrescription?: boolean;
  controlled?: boolean;
  /** Búsqueda por nombre. */
  search?: string;
}

/** Medicamento_Controlado: medicamento cuya clasificación de control es "controlado". */
export function isControlledMedication(product: Pick<ProductLike, 'medicationInfo'>): boolean {
  return product.medicationInfo?.controlClass === CONTROLLED_CONTROL_CLASS;
}

/**
 * Criterios de la lista de Productos. Los filtros de medicamento (tipo, clasificación de control,
 * receta requerida y Medicamento_Controlado) solo los cumplen productos con datos de medicamento,
 * y la subcategoría solo la cumplen insumos médicos. El alcance por inventario lo aplica `inventoryScope`.
 */
export function productCriteria(filters: ProductFilters): Criterion<ProductLike>[] {
  const medication = (row: ProductLike) => row.medicationInfo ?? undefined;
  return [
    equals((p: ProductLike) => p.category, filters.category),
    equals((p: ProductLike) => (p.category === 'insumo médico' ? p.classification : undefined), filters.subcategory),
    equals((p: ProductLike) => availabilityOf(p.quantity), filters.availability),
    equals((p: ProductLike) => isLowStock(p.quantity, p.minStock), filters.lowStock),
    equals((p: ProductLike) => p.supplierId, filters.supplierId),
    equals((p: ProductLike) => medication(p)?.type, filters.medicationType),
    equals((p: ProductLike) => medication(p)?.controlClass, filters.controlClass),
    equals((p: ProductLike) => medication(p)?.requiresPrescription, filters.requiresPrescription),
    equals((p: ProductLike) => (medication(p) ? isControlledMedication(p) : undefined), filters.controlled),
    search((p: ProductLike) => [p.name], filters.search),
  ];
}

// ---------- Movimientos_de_Inventario (Req. 25.5) ----------

export interface MovementLike {
  productId: number;
  type: string;
  userId: number;
  createdAt: Date;
  product: { category: string };
}

export interface MovementFilters extends DateRange {
  productId?: number;
  category?: string;
  type?: string;
  userId?: number;
}

/** Criterios del historial de movimientos: Producto, categoría, tipo, usuario y rango de fechas inclusivo. */
export function movementCriteria(filters: MovementFilters): Criterion<MovementLike>[] {
  return [
    equals((m: MovementLike) => m.productId, filters.productId),
    equals((m: MovementLike) => m.product.category, filters.category),
    equals((m: MovementLike) => m.type, filters.type),
    equals((m: MovementLike) => m.userId, filters.userId),
    dateRange((m: MovementLike) => m.createdAt, { from: filters.from, to: filters.to }),
  ];
}
