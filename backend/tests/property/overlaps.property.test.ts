// Prueba de propiedades del solape de Eventos con el período (tarea 3.27, Property 31).
//
// Se generan Eventos y rangos [desde, hasta] cuyos extremos se colocan a menudo exactamente sobre los
// extremos del otro intervalo o a 1 ms de ellos, además de valores al azar. El oráculo no repite la
// fórmula de la implementación:
// - para intervalos bien formados (inicio ≤ fin, desde ≤ hasta), hay solape si y solo si existe un
//   instante común: max(inicio, desde) ≤ min(fin, hasta);
// - para cualquier par de intervalos, la definición equivale a "no termina antes de desde y no empieza
//   después de hasta".
// También se comprueba la simetría en intervalos bien formados y que las fechas no se modifiquen.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { overlaps } from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const BASE = Date.UTC(2026, 2, 10, 6);
const DAY = 86_400_000;

/** Un extremo relativo a una referencia: exactamente en ella, a 1 ms o lejos. */
const nearArb = fc.oneof(fc.constantFrom(-1, 0, 1), fc.integer({ min: -3 * DAY, max: 3 * DAY }));

const scenarioArb = fc
  .record({
    from: fc.integer({ min: BASE - 5 * DAY, max: BASE + 5 * DAY }),
    rangeLength: fc.oneof(fc.constantFrom(0, 1, DAY - 1), fc.integer({ min: 0, max: 31 * DAY }), fc.integer({ min: -DAY, max: -1 })),
    startRef: fc.constantFrom('from', 'to'),
    startDelta: nearArb,
    endRef: fc.constantFrom('from', 'to', 'start'),
    endDelta: nearArb,
  })
  .map(({ from, rangeLength, startRef, startDelta, endRef, endDelta }) => {
    const to = from + rangeLength;
    const start = (startRef === 'from' ? from : to) + startDelta;
    const end = (endRef === 'from' ? from : endRef === 'to' ? to : start) + endDelta;
    return { start, end, from, to };
  });

describe('Solape de Eventos con el período (propiedades)', () => {
  // Feature: hospital-management-system, Property 31: Solape de Eventos con el período
  it('Property 31: overlaps es verdadero si y solo si inicio ≤ hasta y fin ≥ desde', () => {
    fc.assert(
      fc.property(scenarioArb, ({ start, end, from, to }) => {
        const ev = { start: new Date(start), end: new Date(end) };
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const result = overlaps(ev, fromDate, toDate);

        // Definición, expresada como "no termina antes del rango ni empieza después de él".
        const endsBefore = end < from;
        const startsAfter = start > to;
        expect(result).toBe(!endsBefore && !startsAfter);

        // Intervalos bien formados: solape si y solo si comparten al menos un instante; es simétrico.
        if (start <= end && from <= to) {
          expect(result).toBe(Math.max(start, from) <= Math.min(end, to));
          expect(overlaps({ start: fromDate, end: toDate }, ev.start, ev.end)).toBe(result);
        }

        // Las fechas recibidas no cambian.
        expect([ev.start.getTime(), ev.end.getTime(), fromDate.getTime(), toDate.getTime()]).toEqual([start, end, from, to]);
      }),
      RUNS,
    );
  });
});
