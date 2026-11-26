// Reglas puras de stock e inventarios (Req. 7.3, 7.4, 7.9, 7.10, 23.2, 23.5).
// `lowStock` y `availability` no se guardan en la base de datos: se calculan con estas funciones.

import {
  CLEANING_INVENTORY_CATEGORIES,
  MEDICAL_INVENTORY_CATEGORIES,
  type InventoryMovementType,
  type ProductAvailability,
  type Role,
} from './constants';

function assertQuantity(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} debe ser un entero mayor o igual a 0 (recibido: ${value}).`);
  }
}

/** Stock_Bajo: la cantidad es menor o igual que el Stock_Mínimo (Req. 7.3). */
export function isLowStock(quantity: number, minStock: number): boolean {
  assertQuantity('quantity', quantity);
  assertQuantity('minStock', minStock);
  return quantity <= minStock;
}

/** Disponibilidad del Producto: "agotado" si la cantidad es cero; si no, "disponible" (Req. 7.4). */
export function availabilityOf(quantity: number): ProductAvailability {
  assertQuantity('quantity', quantity);
  return quantity === 0 ? 'agotado' : 'disponible';
}

/** Módulo_Inventario (insumos médicos y medicamentos) o Módulo_Inventario_Limpieza. */
export type InventoryArea = 'medical' | 'cleaning';

/** Categorías que muestra cada inventario (Req. 23.2). */
export const INVENTORY_AREA_CATEGORIES: Readonly<Record<InventoryArea, readonly string[]>> = {
  medical: MEDICAL_INVENTORY_CATEGORIES,
  cleaning: CLEANING_INVENTORY_CATEGORIES,
};

/** Roles que pueden consultar cada inventario (Req. 7.10, 23.5). */
const READ_ROLES: Readonly<Record<InventoryArea, readonly Role[]>> = {
  medical: ['ADMIN'],
  cleaning: ['ADMIN', 'CLEANING'],
};

/**
 * Productos que el rol puede consultar en un inventario.
 * - Módulo_Inventario: solo ADMIN; devuelve únicamente `insumo médico` y `medicamento`.
 * - Módulo_Inventario_Limpieza: ADMIN y CLEANING; devuelve únicamente `material de limpieza`.
 * Devuelve 'DENIED' si el rol no tiene acceso (el llamador responde 403 sin datos). El alcance por
 * categoría se aplica siempre, independientemente de cualquier filtro de categoría solicitado.
 */
export function inventoryScope<T extends { category: string }>(
  role: Role,
  products: readonly T[],
  area: InventoryArea,
): T[] | 'DENIED' {
  if (!READ_ROLES[area].includes(role)) return 'DENIED';
  const categories = INVENTORY_AREA_CATEGORIES[area];
  return products.filter((product) => categories.includes(product.category));
}

// ---------- Movimientos_de_Inventario (Req. 7.7, 24.3, 24.4, 25.1–25.3) ----------

/** Cantidad máxima de un Producto (modelo de datos: 0 a 999 999). */
export const MAX_PRODUCT_QUANTITY = 999_999;

export type MovementError = 'INSUFFICIENT' | 'OVERFLOW' | 'INVALID';
export type MovementResult = { ok: true; before: number; after: number } | { ok: false; error: MovementError };

/**
 * Aplica un Movimiento_de_Inventario a la cantidad actual sin efectos secundarios:
 * - "entrada": suma `quantity` (entero de 1 a 999 999); si el resultado supera 999 999, `OVERFLOW` (409).
 * - "salida": resta `quantity` (entero de 1 a 999 999); si es mayor que la cantidad actual, `INSUFFICIENT` (409).
 * - "ajuste": `quantity` es la cantidad resultante (entero de 0 a 999 999).
 * Una cantidad del movimiento fuera de esos rangos o no entera da `INVALID` (400). En caso de error la
 * cantidad no cambia; el llamador conserva `current`.
 * @throws RangeError si `current` no es un entero de 0 a 999 999.
 */
export function applyMovement(current: number, m: { type: InventoryMovementType; quantity: number }): MovementResult {
  assertQuantity('current', current);
  if (current > MAX_PRODUCT_QUANTITY) throw new RangeError(`current no puede superar ${MAX_PRODUCT_QUANTITY} (recibido: ${current}).`);
  const q = m.quantity;
  if (!Number.isSafeInteger(q)) return { ok: false, error: 'INVALID' };

  switch (m.type) {
    case 'entrada':
      if (q < 1 || q > MAX_PRODUCT_QUANTITY) return { ok: false, error: 'INVALID' };
      if (current + q > MAX_PRODUCT_QUANTITY) return { ok: false, error: 'OVERFLOW' };
      return { ok: true, before: current, after: current + q };
    case 'salida':
      if (q < 1 || q > MAX_PRODUCT_QUANTITY) return { ok: false, error: 'INVALID' };
      if (q > current) return { ok: false, error: 'INSUFFICIENT' };
      return { ok: true, before: current, after: current - q };
    case 'ajuste':
      if (q < 0 || q > MAX_PRODUCT_QUANTITY) return { ok: false, error: 'INVALID' };
      return { ok: true, before: current, after: q };
    default:
      return { ok: false, error: 'INVALID' };
  }
}
