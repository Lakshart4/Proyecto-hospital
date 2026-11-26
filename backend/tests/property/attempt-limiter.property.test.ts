// Prueba de propiedades del límite de intentos fallidos (tarea 4.5, Property 29).
//
// Secuencias de operaciones (fallo, reinicio por éxito, consulta) sobre dos claves, con avances del
// reloj de 0 a 20 minutos y en los límites (15 min − 1 ms, 15 min, 15 min + 1 ms). El oráculo guarda el
// historial de cada clave y lo vuelve a recorrer desde el principio en cada consulta, aplicando las reglas
// aprobadas: un fallo cuenta mientras no pasen 15 min; el quinto vigente bloquea 15 min desde ese fallo;
// los fallos durante el bloqueo se ignoran; al terminar el bloqueo el contador vuelve a cero.
// Una tercera clave nunca usada nunca queda bloqueada, y cada instancia es independiente.
// En la mitad de los casos se antepone un prefijo de borde generado (fin del bloqueo o borde de la
// ventana a 15 min − 1 ms, 15 min y 15 min + 1 ms); los seis bordes se ejecutan además siempre como
// ejemplos fijos al inicio de cada ejecución.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { AttemptLimiter } from '../../src/middlewares/attemptLimiter';

const RUNS = { numRuns: 100 };
const MIN = 60_000;
const WINDOW = 15 * MIN;
const KEYS = ['a', 'b'] as const;

type Op = { kind: 'fail' | 'reset' | 'check'; key: (typeof KEYS)[number]; advance: number };

const opArb: fc.Arbitrary<Op> = fc.record({
  kind: fc.oneof({ arbitrary: fc.constant<'fail'>('fail'), weight: 6 }, { arbitrary: fc.constant<'check'>('check'), weight: 3 }, fc.constant<'reset'>('reset')),
  key: fc.oneof({ arbitrary: fc.constant<'a'>('a'), weight: 3 }, fc.constant<'b'>('b')),
  advance: fc.oneof(
    { arbitrary: fc.constantFrom(0, 1, 2, 1000), weight: 6 },
    { arbitrary: fc.constantFrom(WINDOW - 1, WINDOW, WINDOW + 1, 3 * MIN, 5 * MIN), weight: 2 },
    fc.integer({ min: 0, max: 20 * MIN }),
  ),
});

/**
 * Prefijo de borde que se antepone a la secuencia aleatoria:
 * - `unblock`: 5 fallos seguidos; luego una consulta a 15 min − 1 ms, 15 min o 15 min + 1 ms del quinto y
 *   un fallo nuevo en ese instante (fin del bloqueo y contador en cero).
 * - `window`: 4 fallos seguidos y un quinto a 15 min − 1 ms, 15 min o 15 min + 1 ms del primero (ventana).
 */
type Prefix = { kind: 'unblock' | 'window'; key: (typeof KEYS)[number]; offset: -1 | 0 | 1 };

const prefixArb: fc.Arbitrary<Prefix> = fc.record({
  kind: fc.constantFrom<'unblock' | 'window'>('unblock', 'window'),
  key: fc.constantFrom(...KEYS),
  offset: fc.constantFrom<-1 | 0 | 1>(-1, 0, 1),
});

function expandPrefix(prefix: Prefix): Op[] {
  const fail = (advance: number): Op => ({ kind: 'fail', key: prefix.key, advance });
  if (prefix.kind === 'unblock') {
    return [fail(0), fail(1), fail(1), fail(1), fail(1), { kind: 'check', key: prefix.key, advance: WINDOW + prefix.offset }, fail(0)];
  }
  return [fail(0), fail(1), fail(1), fail(1), fail(WINDOW + prefix.offset - 3)];
}

/** Los seis bordes, siempre incluidos al inicio de cada ejecución (reproducibles), sin secuencia aleatoria. */
const BORDER_EXAMPLES: [number, Prefix | null, Op[]][] = (['unblock', 'window'] as const).flatMap((kind) =>
  ([-1, 0, 1] as const).map((offset): [number, Prefix | null, Op[]] => [1_700_000_000_000, { kind, key: 'a', offset }, []]),
);

type Event = { kind: 'fail' | 'reset'; at: number };

/** Recorre el historial de una clave y dice si está bloqueada en `now`. */
function oracleBlocked(history: readonly Event[], now: number): boolean {
  let fails: number[] = [];
  let blockedAt: number | null = null;
  const expire = (t: number) => {
    if (blockedAt !== null && t - blockedAt >= WINDOW) {
      blockedAt = null;
      fails = [];
    }
  };
  for (const event of history) {
    expire(event.at);
    if (event.kind === 'reset') {
      fails = [];
      blockedAt = null;
    } else if (blockedAt === null) {
      fails = [...fails.filter((f) => event.at - f < WINDOW), event.at];
      if (fails.length >= 5) {
        blockedAt = event.at;
        fails = [];
      }
    }
  }
  expire(now);
  return blockedAt !== null;
}

describe('Límite de intentos (propiedades)', () => {
  // Feature: hospital-management-system, Property 29: Límite de intentos fallidos
  it('Property 29: bloqueada si y solo si hubo 5 fallos dentro de 15 minutos y no pasaron 15 minutos desde el quinto; otra clave no se ve afectada', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 4_000_000_000_000 }),
        fc.option(prefixArb, { nil: null, freq: 2 }),
        fc.array(opArb, { maxLength: 40 }),
        (start, prefix, randomOps) => {
        const ops = [...(prefix === null ? [] : expandPrefix(prefix)), ...randomOps];
        const limiter = new AttemptLimiter();
        const other = new AttemptLimiter();
        const history: Record<string, Event[]> = { a: [], b: [] };
        let now = start;

        for (const op of ops) {
          now += op.advance;
          if (op.kind === 'fail') {
            limiter.registerFailure(op.key, new Date(now));
            history[op.key]!.push({ kind: 'fail', at: now });
          } else if (op.kind === 'reset') {
            limiter.reset(op.key);
            history[op.key]!.push({ kind: 'reset', at: now });
          }
          for (const key of KEYS) expect(limiter.isBlocked(key, new Date(now))).toBe(oracleBlocked(history[key]!, now));
          expect(limiter.isBlocked('z', new Date(now))).toBe(false);
          expect(other.isBlocked('a', new Date(now))).toBe(false);
        }
        },
      ),
      { ...RUNS, examples: BORDER_EXAMPLES },
    );
  });
});
