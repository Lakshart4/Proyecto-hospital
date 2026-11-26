// Prueba de propiedades de Entregas_de_Proveedor (tarea 3.17, Property 17).
//
// Se genera una entrega con su Producto y una secuencia de operaciones (recibir, cancelar, editar) que
// se aplican con las reglas de domain/deliveries.ts. Un oráculo propio de la prueba, escrito a partir
// de Property 17 y los Req. 24.1–24.6, predice el resultado de cada operación y lleva el estado de la
// entrega y la cantidad del Producto. En la recepción, los datos inválidos se informan antes que el
// conflicto de estado (orden aprobado en la tarea 3.15).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DeliveryStatus } from '../../src/domain/constants';
import { canEditDelivery, receiveDelivery, transitionDelivery, validateDeliveryData, type DeliveryLike } from '../../src/domain/deliveries';

const RUNS = { numRuns: 100 };
const MAX = 999_999;
const TODAY = new Date('2026-03-10T15:30:00Z');

type ReceivedMode = { mode: 'value'; value: number } | { mode: 'fillToMax'; delta: number };
type Op =
  | { kind: 'receive'; received: ReceivedMode; dateOffset: number }
  | { kind: 'cancel' }
  | { kind: 'edit'; sameSupplier: boolean; quantityRequested: number };

const quantityArb = fc.oneof(fc.constantFrom(1, MAX), fc.integer({ min: 1, max: 1000 }), fc.integer({ min: 1, max: MAX }));
const invalidQuantityArb = fc.constantFrom(0, -1, MAX + 1, 2.5);

const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('receive' as const),
      received: fc.oneof(
        fc.record({ mode: fc.constant('value' as const), value: fc.oneof(quantityArb, invalidQuantityArb) }),
        // La cantidad que lleva el Producto justo a 999 999, una menos o una más.
        fc.record({ mode: fc.constant('fillToMax' as const), delta: fc.integer({ min: -1, max: 1 }) }),
      ),
      // Fecha de recepción respecto de hoy: antes, exactamente hoy o 1 ms después.
      dateOffset: fc.oneof(fc.constantFrom(0, 1, -1), fc.integer({ min: -30 * 86_400_000, max: 0 })),
    }),
    weight: 4,
  },
  { arbitrary: fc.constant({ kind: 'cancel' as const }), weight: 2 },
  {
    arbitrary: fc.record({ kind: fc.constant('edit' as const), sameSupplier: fc.boolean(), quantityRequested: fc.oneof(quantityArb, invalidQuantityArb) }),
    weight: 2,
  },
);

const scenarioArb = fc.record({
  status: fc.oneof({ arbitrary: fc.constant<DeliveryStatus>('programada'), weight: 3 }, { arbitrary: fc.constantFrom<DeliveryStatus>('recibida', 'cancelada'), weight: 1 }),
  productQty: fc.oneof(fc.constantFrom(0, MAX - 1, MAX), fc.integer({ min: 0, max: MAX })),
  supplierId: fc.integer({ min: 1, max: 5 }),
  quantityRequested: quantityArb,
  ops: fc.array(opArb, { minLength: 1, maxLength: 10 }),
});

const isQuantity = (n: number) => Number.isInteger(n) && n >= 1 && n <= MAX;

describe('Entregas de proveedor (propiedades)', () => {
  // Feature: hospital-management-system, Property 17: Entregas de proveedor
  it('Property 17: solo una entrega programada se recibe, cancela o edita; la recepción suma exactamente lo recibido', () => {
    fc.assert(
      fc.property(scenarioArb, ({ status: initial, productQty: initialQty, supplierId, quantityRequested, ops }) => {
        const product = { supplierId };
        let delivery: DeliveryLike = { status: initial, supplierId, productId: 1, quantityRequested };
        let productQty = initialQty;

        for (const op of ops) {
          const before = structuredClone(delivery);
          if (op.kind === 'receive') {
            const received = op.received.mode === 'value' ? op.received.value : MAX - productQty + op.received.delta;
            const receivedDate = new Date(TODAY.getTime() + op.dateOffset);
            const passed = delivery;
            const result = receiveDelivery(passed, productQty, received, receivedDate, TODAY);
            // La entrega recibida como argumento no se modifica.
            expect(passed).toEqual(before);

            if (!isQuantity(received)) expect(result).toEqual({ ok: false, error: { code: 'INVALID', field: 'quantityReceived' } });
            else if (receivedDate.getTime() > TODAY.getTime()) expect(result).toEqual({ ok: false, error: { code: 'INVALID', field: 'receivedDate' } });
            else if (delivery.status !== 'programada') expect(result).toEqual({ ok: false, error: { code: 'CONFLICT' } });
            else if (productQty + received > MAX) expect(result).toEqual({ ok: false, error: { code: 'OVERFLOW' } });
            else {
              expect(result).toEqual({ ok: true, status: 'recibida', quantityReceived: received, receivedDate, before: productQty, after: productQty + received });
              // La recepción suma exactamente la cantidad recibida.
              productQty += received;
              delivery = { ...delivery, status: 'recibida' };
            }
          } else if (op.kind === 'cancel') {
            const allowed = transitionDelivery(delivery.status, 'cancelada');
            expect(allowed).toBe(delivery.status === 'programada');
            // La cancelación nunca modifica la cantidad del Producto.
            if (allowed) delivery = { ...delivery, status: 'cancelada' };
          } else {
            const editable = canEditDelivery(delivery.status);
            expect(editable).toBe(delivery.status === 'programada');
            if (editable) {
              const edited = { supplierId: op.sameSupplier ? supplierId : supplierId + 1, quantityRequested: op.quantityRequested };
              const fields = validateDeliveryData(edited, product).map((e) => e.field);
              const expectedFields = [
                ...(isQuantity(op.quantityRequested) ? [] : ['quantityRequested']),
                ...(op.sameSupplier ? [] : ['supplierId']),
              ];
              expect(fields).toEqual(expectedFields);
              if (fields.length === 0) delivery = { ...delivery, quantityRequested: op.quantityRequested };
            }
          }
          // Desde "recibida" o "cancelada" no hay ninguna transición posible.
          if (delivery.status !== 'programada') {
            expect(transitionDelivery(delivery.status, 'recibida')).toBe(false);
            expect(transitionDelivery(delivery.status, 'cancelada')).toBe(false);
            expect(canEditDelivery(delivery.status)).toBe(false);
          }
        }
        // La cantidad del Producto solo cambió por recepciones aceptadas y sigue en [0, 999 999].
        expect(productQty).toBeGreaterThanOrEqual(initialQty);
        expect(productQty).toBeLessThanOrEqual(MAX);
      }),
      RUNS,
    );
  });
});
