// Hash y verificación de contraseñas con bcrypt (Req. 1.3, 1.7) y reglas de cambio y restablecimiento
// (Req. 1.8, 1.9, 17.5, 17.7).
//
// bcrypt solo usa los primeros 72 bytes de su entrada. Para que contraseñas de hasta 128 caracteres
// (o con caracteres de varios bytes) no se confundan, el formato nuevo aplica bcrypt a
// base64(SHA-256(contraseña en UTF-8)), que siempre mide 44 caracteres ASCII y no contiene bytes nulos.
// Los hashes nuevos llevan el prefijo `PASSWORD_HASH_PREFIX`, que no puede aparecer al inicio de un
// hash bcrypt clásico (`$2a$`, `$2b$`, `$2y$`). Los hashes bcrypt clásicos, creados antes de este
// cambio, se siguen verificando con bcrypt directo mientras existan; no se invalidan ni se convierten
// aquí. Las contraseñas nunca se guardan ni se registran en texto plano.

import { createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import type { FieldError } from './errors';

/** Costo de bcrypt en ejecución normal (las pruebas usan `BCRYPT_TEST_COST`). */
export const BCRYPT_COST = 10;
export const BCRYPT_TEST_COST = 4;

/** Prefijo que identifica el formato nuevo: bcrypt sobre base64(SHA-256). */
export const PASSWORD_HASH_PREFIX = 'bcrypt-sha256$';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordHashFormat = 'bcrypt-sha256' | 'bcrypt-legacy' | 'unknown';

const LEGACY_BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

function prehash(password: string): string {
  return createHash('sha256').update(password, 'utf8').digest('base64');
}

/** Formato de un hash guardado. */
export function passwordHashFormat(hash: string): PasswordHashFormat {
  if (hash.startsWith(PASSWORD_HASH_PREFIX) && LEGACY_BCRYPT.test(hash.slice(PASSWORD_HASH_PREFIX.length))) {
    return 'bcrypt-sha256';
  }
  if (LEGACY_BCRYPT.test(hash)) return 'bcrypt-legacy';
  return 'unknown';
}

/** Hash en el formato nuevo. */
export async function hashPassword(password: string, cost: number = BCRYPT_COST): Promise<string> {
  return PASSWORD_HASH_PREFIX + (await bcrypt.hash(prehash(password), cost));
}

/**
 * Verifica una contraseña contra un hash guardado en cualquiera de los dos formatos.
 * Un hash con formato desconocido nunca verifica.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  switch (passwordHashFormat(hash)) {
    case 'bcrypt-sha256':
      return bcrypt.compare(prehash(password), hash.slice(PASSWORD_HASH_PREFIX.length));
    case 'bcrypt-legacy':
      return bcrypt.compare(password, hash);
    case 'unknown':
      return false;
  }
}

// ---------- Reglas de cambio y restablecimiento ----------

export const PASSWORD_MESSAGES = {
  newPasswordLength: `La nueva contraseña debe tener entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`,
  currentPasswordIncorrect: 'La contraseña actual es incorrecta.',
} as const;

/** Errores de la contraseña nueva: debe ser texto de 8 a 128 caracteres. Vacío si es válida. */
export function validateNewPassword(newPassword: unknown, field = 'newPassword'): FieldError[] {
  const valid =
    typeof newPassword === 'string' &&
    newPassword.length >= PASSWORD_MIN_LENGTH &&
    newPassword.length <= PASSWORD_MAX_LENGTH;
  return valid ? [] : [{ field, message: PASSWORD_MESSAGES.newPasswordLength }];
}

export type PasswordUpdateResult =
  | { ok: true; hash: string }
  /** `hash` es el hash recibido, sin cambios. */
  | { ok: false; hash: string; errors: FieldError[] };

/**
 * Cambio de contraseña (Req. 1.8, 1.9): se acepta si y solo si la actual coincide con el hash y la nueva
 * tiene de 8 a 128 caracteres. Si se rechaza, devuelve el mismo hash y los errores de cada campo.
 */
export async function evaluatePasswordChange(input: {
  currentHash: string;
  currentPassword: unknown;
  newPassword: unknown;
  cost?: number;
}): Promise<PasswordUpdateResult> {
  const errors: FieldError[] = [];
  const currentOk = typeof input.currentPassword === 'string' && (await verifyPassword(input.currentPassword, input.currentHash));
  if (!currentOk) errors.push({ field: 'currentPassword', message: PASSWORD_MESSAGES.currentPasswordIncorrect });
  errors.push(...validateNewPassword(input.newPassword));
  if (errors.length > 0) return { ok: false, hash: input.currentHash, errors };
  return { ok: true, hash: await hashPassword(input.newPassword as string, input.cost) };
}

/**
 * Restablecimiento (Req. 17.5, 17.7): la nueva contraseña se acepta si y solo si tiene de 8 a 128
 * caracteres. Si se rechaza, devuelve el mismo hash. La vigencia del token se comprueba aparte.
 */
export async function evaluatePasswordReset(input: {
  currentHash: string;
  newPassword: unknown;
  cost?: number;
}): Promise<PasswordUpdateResult> {
  const errors = validateNewPassword(input.newPassword);
  if (errors.length > 0) return { ok: false, hash: input.currentHash, errors };
  return { ok: true, hash: await hashPassword(input.newPassword as string, input.cost) };
}
