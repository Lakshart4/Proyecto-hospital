// Reglas puras de vigencia, con el reloj inyectado (Req. 1.5, 17.2, 17.5, 17.6, 18.1, 18.5, 18.7, 18.8).
// Los tokens nunca se comparan en texto plano: se compara el hash SHA-256 guardado con el del token
// presentado (`hashToken` de lib/tokens.ts).

import { timingSafeEqual } from 'node:crypto';

/** Inactividad máxima de una Sesión: 30 minutos. */
export const SESSION_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

function assertValidDate(name: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new RangeError(`${name} debe ser una fecha válida.`);
  }
}

/**
 * La Sesión expiró si pasaron más de 30 minutos desde la última actividad (30 minutos exactos todavía
 * es una Sesión válida). @throws RangeError si alguna fecha no es válida.
 */
export function isSessionExpired(lastActivityAt: Date, now: Date): boolean {
  assertValidDate('lastActivityAt', lastActivityAt);
  assertValidDate('now', now);
  return now.getTime() - lastActivityAt.getTime() > SESSION_IDLE_TIMEOUT_MS;
}

/** Vigencia del Token_de_Recuperación: 30 minutos desde su creación (Req. 17.2). */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
/** Vigencia de la Autorización_Administrativa: 10 minutos desde el otorgamiento (Req. 18.1). */
export const ADMIN_AUTHORIZATION_TTL_MS = 10 * 60 * 1000;

/** Compara dos hashes en tiempo constante; hashes de distinta longitud nunca coinciden. */
function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Property 27: el Token_de_Recuperación es utilizable si y solo si el hash del presentado coincide con el
 * guardado, no se usó (`usedAt` nulo) y `now <= expiresAt` (el instante de vencimiento todavía es válido).
 * @throws RangeError si alguna fecha no es válida.
 */
export function isResetTokenUsable(
  t: { hash: string; expiresAt: Date; usedAt: Date | null },
  presentedHash: string,
  now: Date,
): boolean {
  assertValidDate('expiresAt', t.expiresAt);
  assertValidDate('now', now);
  return t.usedAt === null && now.getTime() <= t.expiresAt.getTime() && sameHash(t.hash, presentedHash);
}

/**
 * Property 28: la Autorización_Administrativa es válida si y solo si pertenece a la Sesión actual, no fue
 * revocada y `now < expiresAt` (en el instante de vencimiento ya no es válida).
 * @throws RangeError si alguna fecha no es válida.
 */
export function isAdminAuthorizationValid(
  a: { sessionId: number; expiresAt: Date; revokedAt: Date | null },
  currentSessionId: number,
  now: Date,
): boolean {
  assertValidDate('expiresAt', a.expiresAt);
  assertValidDate('now', now);
  return a.sessionId === currentSessionId && a.revokedAt === null && now.getTime() < a.expiresAt.getTime();
}
