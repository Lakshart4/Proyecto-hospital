// Prueba de propiedades del saneador de auditoría (tarea 4.18, Property 39).
// Objetos anidados (hasta 4 niveles, con arreglos) con claves secretas en distintas formas
// (password, newPassword, passwordHash, contraseña, resetToken, sid, aid, adminAuthorization,
// SESSION_SECRET…), claves normales y claves al azar. El oráculo recorre el objeto por su cuenta y usa
// una lista explícita de patrones; comprueba que no queda ninguna clave secreta, que el resto se conserva
// igual y que la entrada no cambia.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sanitizeAuditDetails } from '../../src/domain/others';

const RUNS = { numRuns: 100 };

const SECRET_KEYS = [
  'password', 'newPassword', 'currentPassword', 'PASSWORD', 'passwordHash', 'password_hash', 'hash', 'tokenHash',
  'token', 'resetToken', 'reset_token', 'sessionToken', 'sid', 'SID', 'aid', 'Aid', 'adminAuthorization',
  'admin-authorization', 'autorizaciónAdministrativa', 'contraseña', 'Contraseña', 'nuevaContrasena',
  'SESSION_SECRET', 'secret', 'passwd', 'refreshToken', 'access_token', 'authorization', 'tokenCount',
  'passwordChangedAt', 'resetTokenExpiresAt', 'HTTPAuthorization', 'hash2', 'v2Token', 'API-Token value',
];
/** Contienen un fragmento sensible solo de forma accidental: deben conservarse. */
const LOOKALIKE_KEYS = ['hashtag', 'tokenizer', 'passwords', 'secretary', 'sidebar', 'aide', 'paid', 'said', 'sidValue', 'aid_code', 'rehashed'];
const SAFE_KEYS = ['name', 'email', 'quantityBefore', 'quantityAfter', 'roomId', 'patientId', 'reason', 'status', 'before', 'after', 'role', 'ip'];

const WORDS = new Set(['password', 'passwd', 'contrasena', 'hash', 'token', 'secret', 'authorization', 'autorizacion']);
const isUpper = (c: string) => c >= 'A' && c <= 'Z';
const isLower = (c: string) => c >= 'a' && c <= 'z';
const isDigit = (c: string) => c >= '0' && c <= '9';

/** Oráculo: segmenta recorriendo la clave carácter por carácter (sin expresiones de reemplazo). */
function oracleSegments(key: string): string[] {
  const chars = [...key.normalize('NFD').replace(/\p{M}/gu, '')];
  const segments: string[] = [];
  let current = '';
  chars.forEach((c, i) => {
    const prev = chars[i - 1] ?? '';
    const next = chars[i + 1] ?? '';
    if (!(isUpper(c) || isLower(c) || isDigit(c))) {
      if (current) segments.push(current);
      current = '';
      return;
    }
    const boundary =
      current !== '' &&
      ((isLower(prev) && isUpper(c)) ||
        (isUpper(prev) && isUpper(c) && isLower(next)) ||
        (isDigit(prev) !== isDigit(c)));
    if (boundary) {
      segments.push(current);
      current = '';
    }
    current += c;
  });
  if (current) segments.push(current);
  return segments.map((s) => s.toLowerCase());
}

function oracleIsSecret(key: string): boolean {
  if (key.toLowerCase() === 'sid' || key.toLowerCase() === 'aid') return true;
  return oracleSegments(key).some((s) => WORDS.has(s));
}

function oracleClean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(oracleClean);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => !oracleIsSecret(k)).map(([k, v]) => [k, oracleClean(v)]));
  }
  return value;
}

function secretKeysIn(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(secretKeysIn);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [...(oracleIsSecret(k) ? [k] : []), ...secretKeysIn(v)]);
  }
  return [];
}

const keyArb = fc.oneof(
  { arbitrary: fc.constantFrom(...SECRET_KEYS), weight: 3 },
  { arbitrary: fc.constantFrom(...LOOKALIKE_KEYS), weight: 2 },
  { arbitrary: fc.constantFrom(...SAFE_KEYS), weight: 3 },
  fc.string({ minLength: 1, maxLength: 8 }).filter((k) => k !== '__proto__'),
);
const leafArb = fc.oneof(fc.string({ maxLength: 12 }), fc.integer(), fc.boolean(), fc.constant(null));

const { tree } = fc.letrec((tie) => ({
  tree: fc.oneof({ depthSize: 'small', withCrossShrink: true }, leafArb, tie('object'), tie('array')),
  object: fc.dictionary(keyArb, tie('tree'), { maxKeys: 5 }),
  array: fc.array(tie('tree'), { maxLength: 3 }),
}));
const detailsArb = fc.dictionary(keyArb, tree, { minKeys: 1, maxKeys: 6 }) as fc.Arbitrary<Record<string, unknown>>;

describe('Saneador de auditoría (propiedades)', () => {
  // Feature: hospital-management-system, Property 39: Auditoría sin datos secretos
  it('Property 39: sanitizeAuditDetails no deja claves de contraseña, hash, token de recuperación, autorización administrativa ni token de sesión a ninguna profundidad y conserva el resto', () => {
    fc.assert(
      fc.property(detailsArb, (details) => {
        const copy = structuredClone(details);
        const result = sanitizeAuditDetails(details);
        expect(secretKeysIn(result)).toEqual([]);
        expect(result).toEqual(oracleClean(details));
        expect(details).toEqual(copy);
      }),
      RUNS,
    );
  });
});
