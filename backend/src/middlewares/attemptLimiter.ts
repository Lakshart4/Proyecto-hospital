// Límite de intentos fallidos en memoria (Req. 1.10, 17.8, 18.4), con el reloj inyectado.
//
// Reglas aprobadas:
// - Un fallo cuenta mientras no hayan pasado 15 minutos desde que ocurrió (`now − t < 15 min`).
// - Al registrar el quinto fallo vigente, la clave queda bloqueada durante 15 minutos desde ese fallo
//   (bloqueada mientras `now − quinto < 15 min`).
// - Los fallos registrados mientras la clave está bloqueada se ignoran: no prolongan el bloqueo.
// - Al terminar el bloqueo el contador vuelve a cero.
// - `reset` borra el estado de la clave (por ejemplo, tras un inicio de sesión correcto).
// Cada flujo (inicio de sesión por IP, recuperación por IP, autorización administrativa por usuario)
// usa su propia instancia, así que sus claves no se mezclan. El middleware de Express se agrega en la
// tarea 4.19.

export const MAX_FAILED_ATTEMPTS = 5;
export const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
export const BLOCK_DURATION_MS = 15 * 60 * 1000;

interface KeyState {
  /** Instantes (ms) de los fallos vigentes, en orden. */
  failures: number[];
  /** Instante (ms) del quinto fallo que bloqueó la clave, o null. */
  blockedAt: number | null;
}

function toMs(now: Date): number {
  const ms = now instanceof Date ? now.getTime() : Number.NaN;
  if (Number.isNaN(ms)) throw new RangeError('now debe ser una fecha válida.');
  return ms;
}

export class AttemptLimiter {
  private readonly states = new Map<string, KeyState>();

  /** Estado vigente de la clave en `now`; borra el bloqueo vencido (el contador vuelve a cero). */
  private current(key: string, now: number): KeyState | undefined {
    const state = this.states.get(key);
    if (state === undefined) return undefined;
    if (state.blockedAt !== null && now - state.blockedAt >= BLOCK_DURATION_MS) {
      this.states.delete(key);
      return undefined;
    }
    return state;
  }

  /** Registra un fallo de la clave. Si la clave está bloqueada, no hace nada. */
  registerFailure(key: string, now: Date): void {
    const ms = toMs(now);
    const state = this.current(key, ms) ?? { failures: [], blockedAt: null };
    if (state.blockedAt !== null) return;
    state.failures = state.failures.filter((t) => ms - t < ATTEMPT_WINDOW_MS);
    state.failures.push(ms);
    if (state.failures.length >= MAX_FAILED_ATTEMPTS) {
      state.blockedAt = ms;
      state.failures = [];
    }
    this.states.set(key, state);
  }

  /** Verdadero si la clave está bloqueada en `now`. */
  isBlocked(key: string, now: Date): boolean {
    const state = this.current(key, toMs(now));
    return state !== undefined && state.blockedAt !== null;
  }

  /** Borra los fallos y el bloqueo de la clave. */
  reset(key: string): void {
    this.states.delete(key);
  }
}
