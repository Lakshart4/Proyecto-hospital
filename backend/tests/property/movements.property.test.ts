// Prueba de propiedades de conservación de cantidades de inventario (tarea 3.16, Property 16).
//
// Se genera una cantidad inicial en [0, 999 999] y secuencias de Movimientos (entrada, salida, ajuste)
// con cantidades enteras: aleatorias, alrededor de la cantidad actual (salidas de toda la existencia o
// una unidad más), alrededor del límite de 999 999 (entradas que llegan justo al máximo o lo superan)
// y fuera de rango. El oráculo es propio de la prueba: aplica las fórmulas de Property 16 y lleva la
// cuenta de entradas, salidas y variaciones de ajuste para comprobar la conservación al final.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyMovement } from '../../src/domain/stock';

const RUNS = { numRuns: 100 };
const MAX = 999_999;

type MovementType = 'entrada' | 'salida' | 'ajuste';

/** Cómo se elige la cantidad del movimiento, a partir de la cantidad vigente en ese momento. */
type QuantityMode =
  | { mode: 'random'; value: number }
  | { mode: 'aroundCurrent'; delta: number } // current + delta
  | { mode: 'aroundRoom'; delta: number } // (MAX - current) + delta
  | { mode: 'outOfRange'; value: number };

const quantityModeArb: fc.Arbitrary<QuantityMode> = fc.oneof(
  fc.record({ mode: fc.constant('random' as const), value: fc.oneof(fc.integer({ min: 0, max: 1000 }), fc.integer({ min: 0, max: MAX })) }),
  fc.record({ mode: fc.constant('aroundCurrent' as const), delta: fc.integer({ min: -1, max: 1 }) }),
  fc.record({ mode: fc.constant('aroundRoom' as const), delta: fc.integer({ min: -1, max: 1 }) }),
  fc.record({ mode: fc.constant('outOfRange' as const), value: fc.constantFrom(-1, 0, MAX + 1, 2_000_000) }),
);

const scenarioArb = fc.record({
  initial: fc.oneof(fc.constantFrom(0, 1, MAX - 1, MAX), fc.integer({ min: 0, max: MAX })),
  movements: fc.array(fc.record({ type: fc.constantFrom<MovementType>('entrada', 'salida', 'ajuste'), q: quantityModeArb }), { maxLength: 40 }),
});

const resolve = (q: QuantityMode, current: number) => {
  switch (q.mode) {
    case 'random':
    case 'outOfRange':
      return q.value;
    case 'aroundCurrent':
      return current + q.delta;
    case 'aroundRoom':
      return MAX - current + q.delta;
  }
};

/** Resultado esperado de un movimiento según la definición de Property 16 y los Req. 24.4, 25.2, 25.3. */
function expected(type: MovementType, current: number, q: number): { ok: true; after: number } | { ok: false; error: string } {
  if (type === 'ajuste') return q >= 0 && q <= MAX ? { ok: true, after: q } : { ok: false, error: 'INVALID' };
  if (q < 1 || q > MAX) return { ok: false, error: 'INVALID' };
  if (type === 'entrada') return current + q > MAX ? { ok: false, error: 'OVERFLOW' } : { ok: true, after: current + q };
  return q > current ? { ok: false, error: 'INSUFFICIENT' } : { ok: true, after: current - q };
}

describe('Movimientos de inventario (propiedades)', () => {
  // Feature: hospital-management-system, Property 16: Conservación de cantidades de inventario
  it('Property 16: before es la cantidad vigente, after sigue la fórmula de cada tipo y la cantidad se conserva', () => {
    fc.assert(
      fc.property(scenarioArb, ({ initial, movements }) => {
        let current = initial;
        let lastAcceptedAfter: number | null = null;
        let entradas = 0;
        let salidas = 0;
        let ajustes = 0;

        for (const m of movements) {
          const q = resolve(m.q, current);
          const result = applyMovement(current, { type: m.type, quantity: q });
          const want = expected(m.type, current, q);

          if (!want.ok) {
            // Rechazado con el error esperado; la cantidad vigente no cambia.
            expect(result).toEqual({ ok: false, error: want.error });
            continue;
          }
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          expect(result.before).toBe(current);
          expect(result.after).toBe(want.after);
          expect(result.after).toBeGreaterThanOrEqual(0);
          expect(result.after).toBeLessThanOrEqual(MAX);

          if (m.type === 'entrada') entradas += q;
          else if (m.type === 'salida') salidas += q;
          else ajustes += result.after - result.before;
          current = result.after;
          lastAcceptedAfter = result.after;
        }

        // Conservación: la cantidad final es el after del último aceptado y el balance de los movimientos.
        if (lastAcceptedAfter !== null) expect(current).toBe(lastAcceptedAfter);
        else expect(current).toBe(initial);
        expect(current).toBe(initial + entradas - salidas + ajustes);
      }),
      RUNS,
    );
  });
});
