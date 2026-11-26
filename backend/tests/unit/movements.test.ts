// Pruebas de applyMovement (tarea 3.15, Req. 7.7, 24.3, 24.4, 25.1–25.3).
// La propiedad de conservación de cantidades (Property 16) corresponde a la tarea 3.16.

import { describe, expect, it } from 'vitest';
import { MAX_PRODUCT_QUANTITY, applyMovement } from '../../src/domain/stock';

describe('applyMovement', () => {
  it('entrada suma la cantidad y registra before/after', () => {
    expect(applyMovement(10, { type: 'entrada', quantity: 5 })).toEqual({ ok: true, before: 10, after: 15 });
    expect(applyMovement(0, { type: 'entrada', quantity: 1 })).toEqual({ ok: true, before: 0, after: 1 });
  });

  it('entrada que deja exactamente 999 999 se acepta; una unidad más es OVERFLOW', () => {
    expect(applyMovement(999_998, { type: 'entrada', quantity: 1 })).toEqual({ ok: true, before: 999_998, after: MAX_PRODUCT_QUANTITY });
    expect(applyMovement(999_999, { type: 'entrada', quantity: 1 })).toEqual({ ok: false, error: 'OVERFLOW' });
    expect(applyMovement(500_000, { type: 'entrada', quantity: 500_000 })).toEqual({ ok: false, error: 'OVERFLOW' });
  });

  it('salida resta la cantidad, incluida toda la existente', () => {
    expect(applyMovement(10, { type: 'salida', quantity: 3 })).toEqual({ ok: true, before: 10, after: 7 });
    expect(applyMovement(10, { type: 'salida', quantity: 10 })).toEqual({ ok: true, before: 10, after: 0 });
  });

  it('una salida mayor que la existente es INSUFFICIENT', () => {
    expect(applyMovement(10, { type: 'salida', quantity: 11 })).toEqual({ ok: false, error: 'INSUFFICIENT' });
    expect(applyMovement(0, { type: 'salida', quantity: 1 })).toEqual({ ok: false, error: 'INSUFFICIENT' });
  });

  it('ajuste fija la cantidad indicada, de 0 a 999 999', () => {
    expect(applyMovement(10, { type: 'ajuste', quantity: 4 })).toEqual({ ok: true, before: 10, after: 4 });
    expect(applyMovement(10, { type: 'ajuste', quantity: 0 })).toEqual({ ok: true, before: 10, after: 0 });
    expect(applyMovement(10, { type: 'ajuste', quantity: 999_999 })).toEqual({ ok: true, before: 10, after: 999_999 });
    expect(applyMovement(10, { type: 'ajuste', quantity: 10 })).toEqual({ ok: true, before: 10, after: 10 });
  });

  it.each([
    ['entrada', 0],
    ['entrada', -1],
    ['entrada', 1.5],
    ['entrada', 1_000_000],
    ['salida', 0],
    ['salida', Number.NaN],
    ['ajuste', -1],
    ['ajuste', 1_000_000],
    ['ajuste', 2.5],
  ] as const)('%s con cantidad %s es INVALID', (type, quantity) => {
    expect(applyMovement(10, { type, quantity })).toEqual({ ok: false, error: 'INVALID' });
  });

  it('un tipo desconocido es INVALID', () => {
    expect(applyMovement(10, { type: 'traslado' as never, quantity: 1 })).toEqual({ ok: false, error: 'INVALID' });
  });

  it('lanza RangeError si la cantidad actual no es válida', () => {
    expect(() => applyMovement(-1, { type: 'entrada', quantity: 1 })).toThrow(RangeError);
    expect(() => applyMovement(1_000_000, { type: 'entrada', quantity: 1 })).toThrow(RangeError);
    expect(() => applyMovement(1.5, { type: 'entrada', quantity: 1 })).toThrow(RangeError);
  });
});
