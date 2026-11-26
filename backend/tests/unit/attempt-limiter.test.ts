// Pruebas de AttemptLimiter (tarea 4.4; Req. 1.10, 17.8, 18.4).

import { describe, expect, it } from 'vitest';
import { ATTEMPT_WINDOW_MS, AttemptLimiter, BLOCK_DURATION_MS, MAX_FAILED_ATTEMPTS } from '../../src/middlewares/attemptLimiter';

const T0 = Date.UTC(2026, 2, 1, 10, 0, 0);
const MIN = 60_000;
const at = (ms: number) => new Date(T0 + ms);

function failTimes(limiter: AttemptLimiter, key: string, times: number[]) {
  for (const t of times) limiter.registerFailure(key, at(t));
}

describe('AttemptLimiter', () => {
  it('usa 5 fallos, ventana de 15 min y bloqueo de 15 min', () => {
    expect(MAX_FAILED_ATTEMPTS).toBe(5);
    expect(ATTEMPT_WINDOW_MS).toBe(15 * MIN);
    expect(BLOCK_DURATION_MS).toBe(15 * MIN);
  });

  it('cuatro fallos no bloquean; el quinto bloquea a esa clave y no a otra', () => {
    const limiter = new AttemptLimiter();
    failTimes(limiter, 'ip-1', [0, 1, 2, 3]);
    expect(limiter.isBlocked('ip-1', at(4))).toBe(false);
    limiter.registerFailure('ip-1', at(4));
    expect(limiter.isBlocked('ip-1', at(4))).toBe(true);
    expect(limiter.isBlocked('ip-2', at(4))).toBe(false);
  });

  it('el bloqueo dura 15 min desde el quinto fallo: bloqueada en 15 min − 1 ms, libre en 15 min', () => {
    const limiter = new AttemptLimiter();
    failTimes(limiter, 'k', [0, MIN, 2 * MIN, 3 * MIN, 4 * MIN]);
    expect(limiter.isBlocked('k', at(4 * MIN + BLOCK_DURATION_MS - 1))).toBe(true);
    expect(limiter.isBlocked('k', at(4 * MIN + BLOCK_DURATION_MS))).toBe(false);
  });

  it('los fallos durante el bloqueo no lo prolongan', () => {
    const limiter = new AttemptLimiter();
    failTimes(limiter, 'k', [0, 1, 2, 3, 4]);
    failTimes(limiter, 'k', [5 * MIN, 10 * MIN, 14 * MIN]);
    expect(limiter.isBlocked('k', at(4 + BLOCK_DURATION_MS))).toBe(false);
  });

  it('al terminar el bloqueo el contador vuelve a cero', () => {
    const limiter = new AttemptLimiter();
    failTimes(limiter, 'k', [0, 1, 2, 3, 4]);
    const end = 4 + BLOCK_DURATION_MS;
    failTimes(limiter, 'k', [end, end + 1, end + 2, end + 3]);
    expect(limiter.isBlocked('k', at(end + 3))).toBe(false);
    limiter.registerFailure('k', at(end + 4));
    expect(limiter.isBlocked('k', at(end + 4))).toBe(true);
  });

  it('el contador también se reinicia aunque no se consulte isBlocked al terminar el bloqueo', () => {
    const limiter = new AttemptLimiter();
    failTimes(limiter, 'k', [0, 1, 2, 3, 4]);
    limiter.registerFailure('k', at(4 + BLOCK_DURATION_MS));
    expect(limiter.isBlocked('k', at(4 + BLOCK_DURATION_MS))).toBe(false);
  });

  it('un fallo deja de contar a los 15 min: cinco fallos separados por más de la ventana no bloquean', () => {
    const limiter = new AttemptLimiter();
    // El primero vence justo cuando llega el quinto (15 min exactos).
    failTimes(limiter, 'k', [0, MIN, 2 * MIN, 3 * MIN, ATTEMPT_WINDOW_MS]);
    expect(limiter.isBlocked('k', at(ATTEMPT_WINDOW_MS))).toBe(false);
    // Con el quinto 1 ms antes, sí bloquea.
    const other = new AttemptLimiter();
    failTimes(other, 'k', [0, MIN, 2 * MIN, 3 * MIN, ATTEMPT_WINDOW_MS - 1]);
    expect(other.isBlocked('k', at(ATTEMPT_WINDOW_MS - 1))).toBe(true);
  });

  it('reset borra los fallos (por ejemplo, tras un inicio de sesión correcto)', () => {
    const limiter = new AttemptLimiter();
    failTimes(limiter, 'k', [0, 1, 2, 3]);
    limiter.reset('k');
    limiter.registerFailure('k', at(5));
    expect(limiter.isBlocked('k', at(5))).toBe(false);
    failTimes(limiter, 'k', [6, 7, 8]);
    expect(limiter.isBlocked('k', at(8))).toBe(false);
    limiter.registerFailure('k', at(9));
    expect(limiter.isBlocked('k', at(9))).toBe(true);
  });

  it('cada instancia es independiente aunque se use la misma clave', () => {
    const login = new AttemptLimiter();
    const recovery = new AttemptLimiter();
    failTimes(login, '127.0.0.1', [0, 1, 2, 3, 4]);
    expect(login.isBlocked('127.0.0.1', at(5))).toBe(true);
    expect(recovery.isBlocked('127.0.0.1', at(5))).toBe(false);
  });

  it('rechaza fechas inválidas con RangeError', () => {
    const limiter = new AttemptLimiter();
    expect(() => limiter.registerFailure('k', new Date(Number.NaN))).toThrow(RangeError);
    expect(() => limiter.isBlocked('k', new Date('x'))).toThrow(RangeError);
  });
});
