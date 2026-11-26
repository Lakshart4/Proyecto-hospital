// Pruebas de las reglas de Entregas_de_Proveedor (tarea 3.15, Req. 24.1–24.6).
// La propiedad de entregas (Property 17) corresponde a la tarea 3.17.

import { describe, expect, it } from 'vitest';
import { DELIVERY_STATUSES } from '../../src/domain/constants';
import { canEditDelivery, receiveDelivery, transitionDelivery, validateDeliveryData, type DeliveryLike } from '../../src/domain/deliveries';

const TODAY = new Date('2026-03-10T15:30:00Z');
const delivery = (status: DeliveryLike['status']): DeliveryLike => ({ status, supplierId: 1, productId: 7, quantityRequested: 50 });

describe('transitionDelivery y canEditDelivery', () => {
  it('solo permite pasar de "programada" a "recibida" o "cancelada"', () => {
    expect(transitionDelivery('programada', 'recibida')).toBe(true);
    expect(transitionDelivery('programada', 'cancelada')).toBe(true);
    for (const from of ['recibida', 'cancelada'] as const) {
      expect(transitionDelivery(from, 'recibida')).toBe(false);
      expect(transitionDelivery(from, 'cancelada')).toBe(false);
    }
  });

  it('solo se edita una entrega "programada"', () => {
    expect(DELIVERY_STATUSES.filter(canEditDelivery)).toEqual(['programada']);
  });
});

describe('validateDeliveryData', () => {
  it('acepta una cantidad de 1 a 999 999 con el Proveedor del Producto', () => {
    expect(validateDeliveryData({ supplierId: 1, quantityRequested: 1 }, { supplierId: 1 })).toEqual([]);
    expect(validateDeliveryData({ supplierId: 1, quantityRequested: 999_999 }, { supplierId: 1 })).toEqual([]);
  });

  it('rechaza un Proveedor distinto del registrado en el Producto', () => {
    expect(validateDeliveryData({ supplierId: 2, quantityRequested: 10 }, { supplierId: 1 }).map((e) => e.field)).toEqual(['supplierId']);
  });

  it.each([0, -5, 1.5, 1_000_000])('rechaza la cantidad solicitada %s', (quantityRequested) => {
    expect(validateDeliveryData({ supplierId: 1, quantityRequested }, { supplierId: 1 }).map((e) => e.field)).toEqual(['quantityRequested']);
  });
});

describe('receiveDelivery', () => {
  it('recibe una entrega "programada" y suma exactamente la cantidad recibida', () => {
    const d = delivery('programada');
    const copy = structuredClone(d);
    const result = receiveDelivery(d, 20, 30, new Date('2026-03-09T10:00:00Z'), TODAY);
    expect(result).toEqual({
      ok: true,
      status: 'recibida',
      quantityReceived: 30,
      receivedDate: new Date('2026-03-09T10:00:00Z'),
      before: 20,
      after: 50,
    });
    expect(d).toEqual(copy);
  });

  it('acepta una fecha de recepción igual al instante actual y rechaza una posterior', () => {
    expect(receiveDelivery(delivery('programada'), 0, 1, TODAY, TODAY).ok).toBe(true);
    expect(receiveDelivery(delivery('programada'), 0, 1, new Date(TODAY.getTime() + 1), TODAY)).toEqual({
      ok: false,
      error: { code: 'INVALID', field: 'receivedDate' },
    });
  });

  it.each(['recibida', 'cancelada'] as const)('recibir una entrega "%s" devuelve conflicto', (status) => {
    expect(receiveDelivery(delivery(status), 20, 5, TODAY, TODAY)).toEqual({ ok: false, error: { code: 'CONFLICT' } });
  });

  it('una recepción que dejaría el Producto por encima de 999 999 es OVERFLOW', () => {
    expect(receiveDelivery(delivery('programada'), 999_990, 9, TODAY, TODAY).ok).toBe(true);
    expect(receiveDelivery(delivery('programada'), 999_990, 10, TODAY, TODAY)).toEqual({ ok: false, error: { code: 'OVERFLOW' } });
  });

  it.each([0, -1, 2.5, 1_000_000])('rechaza la cantidad recibida %s como INVALID', (received) => {
    expect(receiveDelivery(delivery('programada'), 20, received, TODAY, TODAY)).toEqual({
      ok: false,
      error: { code: 'INVALID', field: 'quantityReceived' },
    });
  });

  it('los datos inválidos se informan antes que el conflicto de estado', () => {
    expect(receiveDelivery(delivery('cancelada'), 20, 0, TODAY, TODAY)).toEqual({ ok: false, error: { code: 'INVALID', field: 'quantityReceived' } });
  });

  it('lanza RangeError con fechas inválidas', () => {
    expect(() => receiveDelivery(delivery('programada'), 0, 1, new Date('x'), TODAY)).toThrow(RangeError);
    expect(() => receiveDelivery(delivery('programada'), 0, 1, TODAY, new Date('x'))).toThrow(RangeError);
  });
});
