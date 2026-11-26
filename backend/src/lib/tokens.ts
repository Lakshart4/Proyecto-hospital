// Tokens aleatorios de sesión, recuperación y Autorización_Administrativa.
// El token solo viaja al cliente (cookie o enlace); la base de datos guarda únicamente su hash SHA-256
// en hexadecimal (Req. 1.5, 17.2, 18.1, 18.2).

import { createHash, randomBytes } from 'node:crypto';

/** Bytes aleatorios de cada token (Req. 17.2: al menos 32). */
export const TOKEN_BYTES = 32;

/** Token nuevo: 32 bytes aleatorios en base64url (43 caracteres). */
export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** Hash SHA-256 en hexadecimal (64 caracteres) que se guarda en lugar del token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
