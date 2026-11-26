// Reglas puras de Entregas_de_Proveedor (Req. 24.1–24.6).
//
// Solo una entrega "programada" puede editarse, recibirse o cancelarse; "recibida" y "cancelada" son
// estados finales (409). La recepción suma la cantidad recibida al Producto con `applyMovement`
// (Movimiento de tipo "entrada"), así que comparte las mismas reglas de rango y desborde.

import type { FieldError } from '../lib/errors';
import type { DeliveryStatus } from './constants';
import { MAX_PRODUCT_QUANTITY, applyMovement } from './stock';

export interface DeliveryLike {
  status: DeliveryStatus;
  supplierId: number;
  productId: number;
  quantityRequested: number;
}

/** Únicas transiciones permitidas: "programada" a "recibida" o a "cancelada" (Req. 24.3, 24.5, 24.6). */
export function transitionDelivery(from: DeliveryStatus, to: 'recibida' | 'cancelada'): boolean {
  return from === 'programada' && (to === 'recibida' || to === 'cancelada');
}

/** Una entrega solo se edita mientras está "programada" (Req. 24.5). */
export const canEditDelivery = (status: DeliveryStatus): boolean => status === 'programada';

const isQuantity = (value: number) => Number.isSafeInteger(value) && value >= 1 && value <= MAX_PRODUCT_QUANTITY;

/**
 * Comprueba los datos de una entrega al crearla o editarla (Req. 24.1, 24.2): cantidad solicitada
 * entera de 1 a 999 999 y Proveedor igual al Proveedor registrado del Producto. Devuelve los errores
 * por campo (lista vacía si es válida); el llamador responde 400. La existencia del Producto y del
 * Proveedor la comprueba el servicio.
 */
export function validateDeliveryData(
  delivery: Pick<DeliveryLike, 'supplierId' | 'quantityRequested'>,
  product: { supplierId: number },
): FieldError[] {
  const errors: FieldError[] = [];
  if (!isQuantity(delivery.quantityRequested)) {
    errors.push({ field: 'quantityRequested', message: `La cantidad solicitada debe ser un número entero entre 1 y ${MAX_PRODUCT_QUANTITY}.` });
  }
  if (delivery.supplierId !== product.supplierId) {
    errors.push({ field: 'supplierId', message: 'El proveedor no es el proveedor registrado del producto.' });
  }
  return errors;
}

export type ReceiveError =
  | { code: 'INVALID'; field: 'quantityReceived' | 'receivedDate' }
  | { code: 'CONFLICT' }
  | { code: 'OVERFLOW' };

export type ReceiveResult =
  | { ok: true; status: 'recibida'; quantityReceived: number; receivedDate: Date; before: number; after: number }
  | { ok: false; error: ReceiveError };

/**
 * Recepción de una entrega (Req. 24.3, 24.4, 24.5). Errores, en este orden:
 * `INVALID` (400) si la cantidad recibida no es un entero de 1 a 999 999 o si la fecha de recepción es
 * posterior a `today` (instante actual); `CONFLICT` (409) si la entrega no está "programada";
 * `OVERFLOW` (409) si la cantidad del Producto superaría 999 999. En caso de error nada cambia.
 * @throws RangeError si alguna fecha no es válida o `productQty` no es una cantidad válida.
 */
export function receiveDelivery(d: DeliveryLike, productQty: number, received: number, receivedDate: Date, today: Date): ReceiveResult {
  for (const [name, date] of [['receivedDate', receivedDate], ['today', today]] as const) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) throw new RangeError(`${name} no es una fecha válida.`);
  }
  if (!isQuantity(received)) return { ok: false, error: { code: 'INVALID', field: 'quantityReceived' } };
  if (receivedDate.getTime() > today.getTime()) return { ok: false, error: { code: 'INVALID', field: 'receivedDate' } };
  if (!transitionDelivery(d.status, 'recibida')) return { ok: false, error: { code: 'CONFLICT' } };

  const movement = applyMovement(productQty, { type: 'entrada', quantity: received });
  if (!movement.ok) return { ok: false, error: { code: 'OVERFLOW' } };
  return {
    ok: true,
    status: 'recibida',
    quantityReceived: received,
    receivedDate: new Date(receivedDate.getTime()),
    before: movement.before,
    after: movement.after,
  };
}
