// Prueba de propiedades de los colores de Tipo_de_Evento (tarea 3.31, Property 36).
//
// Se generan pares de tipos distintos del conjunto de siete Tipos_de_Evento, escrito aquí de forma
// independiente de domain/constants.ts. Para cada par se comprueba que los colores son distintos aun
// sin distinguir mayúsculas (dos hexadecimales que solo difieren en mayúsculas son el mismo color),
// que cada color es un hexadecimal #RRGGBB, que la función es determinista y que llamarla no cambia la
// tabla de colores. Además, una Entrega_de_Proveedor lleva el color del tipo "entrega" (Req. 28.8).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { EventType } from '../../src/domain/constants';
import { EVENT_COLORS, eventColor, fromDelivery } from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const TYPES: EventType[] = ['general', 'actividad', 'entrega', 'cumpleaños', 'agenda individual', 'día inhábil', 'feriado'];
const HEX = /^#[0-9a-fA-F]{6}$/;

const pairArb = fc
  .tuple(fc.integer({ min: 0, max: TYPES.length - 1 }), fc.integer({ min: 0, max: TYPES.length - 2 }))
  .map(([i, j]) => [TYPES[i] as EventType, TYPES[j >= i ? j + 1 : j] as EventType] as const);

describe('Colores de Tipo_de_Evento (propiedades)', () => {
  // Feature: hospital-management-system, Property 36: Colores de Tipo_de_Evento distintos
  it('Property 36: para todo par de Tipos_de_Evento distintos, eventColor devuelve colores distintos', () => {
    fc.assert(
      fc.property(pairArb, fc.nat(), ([a, b], deliveryId) => {
        const tableBefore = JSON.stringify(EVENT_COLORS);
        const colorA = eventColor(a);
        const colorB = eventColor(b);

        expect(a).not.toBe(b);
        expect(colorA).toMatch(HEX);
        expect(colorB).toMatch(HEX);
        expect(colorA.toLowerCase()).not.toBe(colorB.toLowerCase());

        // Determinista y sin efectos sobre la tabla.
        expect(eventColor(a)).toBe(colorA);
        expect(JSON.stringify(EVENT_COLORS)).toBe(tableBefore);

        // Una entrega de proveedor usa el color del tipo "entrega" (Req. 28.8).
        const delivery = fromDelivery({
          id: deliveryId,
          status: 'programada',
          scheduledDate: new Date(Date.UTC(2026, 2, 10, 15)),
          supplierName: 'Proveedor',
          productName: 'Producto',
          quantityRequested: 1,
        });
        expect(delivery.color).toBe(eventColor('entrega'));
      }),
      RUNS,
    );
  });
});
