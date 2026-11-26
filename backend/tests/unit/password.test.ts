// Pruebas de hash, verificación y reglas de contraseña (tareas 4.1 y 4.21; Req. 1.3, 1.7, 1.8, 1.9, 17.5, 17.7).
// Las contraseñas y los hashes bcrypt clásicos se generan en cada ejecución: ninguno queda escrito en el código.

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { describe, expect, it } from 'vitest';
import {
  BCRYPT_TEST_COST,
  PASSWORD_HASH_PREFIX,
  PASSWORD_MESSAGES,
  evaluatePasswordChange,
  evaluatePasswordReset,
  hashPassword,
  passwordHashFormat,
  validateNewPassword,
  verifyPassword,
} from '../../src/lib/password';

const COST = BCRYPT_TEST_COST;
const randomPassword = (bytes = 12) => randomBytes(bytes).toString('base64url');
/** Contraseñas nuevas fuera de rango (7 y 129 caracteres). */
const TOO_SHORT = 'x'.repeat(7);
const TOO_LONG = 'x'.repeat(129);

describe('hashPassword y verifyPassword (formato nuevo)', () => {
  it('el hash lleva el prefijo del formato nuevo, difiere del texto plano y verifica', async () => {
    const password = randomPassword();
    const hash = await hashPassword(password, COST);
    expect(hash.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
    expect(passwordHashFormat(hash)).toBe('bcrypt-sha256');
    expect(hash).not.toContain(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(`${password}x`, hash)).toBe(false);
  });

  it('usa el costo indicado y por defecto 10', async () => {
    const password = randomPassword();
    expect((await hashPassword(password, COST)).slice(PASSWORD_HASH_PREFIX.length, PASSWORD_HASH_PREFIX.length + 7)).toBe('$2b$04$');
    expect((await hashPassword(password)).slice(PASSWORD_HASH_PREFIX.length, PASSWORD_HASH_PREFIX.length + 7)).toBe('$2b$10$');
  });

  it('dos hashes de la misma contraseña son distintos (sal) y ambos verifican', async () => {
    const password = randomPassword();
    const [a, b] = await Promise.all([hashPassword(password, COST), hashPassword(password, COST)]);
    expect(a).not.toBe(b);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword(password, b)).toBe(true);
  });

  it('distingue contraseñas de 128 caracteres que comparten los primeros 72 bytes (límite de bcrypt)', async () => {
    const base = 'a'.repeat(100) + randomPassword(10);
    const p1 = `${base}${'1'.repeat(128 - base.length)}`;
    const p2 = `${base}${'2'.repeat(128 - base.length)}`;
    expect(p1).toHaveLength(128);
    const hash = await hashPassword(p1, COST);
    expect(await verifyPassword(p1, hash)).toBe(true);
    expect(await verifyPassword(p2, hash)).toBe(false);
  });

  it('distingue caracteres de varios bytes y mayúsculas', async () => {
    const password = `Contraseña-ñandú-🔒-${randomPassword(4)}`;
    const hash = await hashPassword(password, COST);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(password.toUpperCase(), hash)).toBe(false);
    expect(await verifyPassword(password.normalize('NFD'), hash)).toBe(false);
  });
});

describe('compatibilidad con hashes bcrypt clásicos', () => {
  it('reconoce el formato clásico y verifica con bcrypt directo', async () => {
    const password = randomPassword();
    const legacy = await bcrypt.hash(password, COST);
    expect(passwordHashFormat(legacy)).toBe('bcrypt-legacy');
    expect(await verifyPassword(password, legacy)).toBe(true);
    expect(await verifyPassword(`${password}x`, legacy)).toBe(false);
  });

  it('acepta las variantes $2a$, $2b$ y $2y$ del formato clásico', async () => {
    const password = randomPassword();
    const legacy = await bcrypt.hash(password, COST);
    for (const variant of ['$2a$', '$2y$']) {
      const other = variant + legacy.slice(4);
      expect(passwordHashFormat(other)).toBe('bcrypt-legacy');
    }
    expect(await verifyPassword(password, `$2a$${legacy.slice(4)}`)).toBe(true);
  });

  it('un hash clásico no se confunde con el formato nuevo ni al revés', async () => {
    const password = randomPassword();
    const legacy = await bcrypt.hash(password, COST);
    const modern = await hashPassword(password, COST);
    // El hash clásico de la contraseña no sirve con el prefijo nuevo (se verificaría el SHA-256).
    expect(await verifyPassword(password, PASSWORD_HASH_PREFIX + legacy)).toBe(false);
    // El hash interno del formato nuevo, sin prefijo, se trata como clásico y no verifica la contraseña.
    expect(await verifyPassword(password, modern.slice(PASSWORD_HASH_PREFIX.length))).toBe(false);
  });

  it('un hash de formato desconocido nunca verifica', async () => {
    const password = randomPassword();
    for (const hash of ['', password, 'hash-ficticio', PASSWORD_HASH_PREFIX, `${PASSWORD_HASH_PREFIX}abc`, '$2b$04$corto']) {
      expect(passwordHashFormat(hash)).toBe('unknown');
      expect(await verifyPassword(password, hash)).toBe(false);
    }
  });
});

describe('validateNewPassword', () => {
  it('acepta de 8 a 128 caracteres y rechaza 7, 129, vacío y no textos', () => {
    expect(validateNewPassword('x'.repeat(8))).toEqual([]);
    expect(validateNewPassword('x'.repeat(128))).toEqual([]);
    for (const value of ['x'.repeat(7), 'x'.repeat(129), '', undefined, null, 12345678, ['x'.repeat(8)]]) {
      expect(validateNewPassword(value)).toEqual([{ field: 'newPassword', message: PASSWORD_MESSAGES.newPasswordLength }]);
    }
  });

  it('no recorta espacios: la longitud es la del texto recibido', () => {
    expect(validateNewPassword('   abc   ')).toEqual([]);
    expect(validateNewPassword(' abcdef')).toHaveLength(1);
  });

  it('el mensaje está en español y nombra el rango', () => {
    expect(PASSWORD_MESSAGES.newPasswordLength).toBe('La nueva contraseña debe tener entre 8 y 128 caracteres.');
  });
});

describe('evaluatePasswordChange', () => {
  it('acepta con la actual correcta y una nueva válida; el hash nuevo verifica la nueva y no la anterior', async () => {
    const current = randomPassword();
    const next = randomPassword();
    const currentHash = await hashPassword(current, COST);
    const result = await evaluatePasswordChange({ currentHash, currentPassword: current, newPassword: next, cost: COST });
    expect(result.ok).toBe(true);
    expect(result.hash).not.toBe(currentHash);
    expect(await verifyPassword(next, result.hash)).toBe(true);
    expect(await verifyPassword(current, result.hash)).toBe(false);
  });

  it('con la actual incorrecta rechaza en currentPassword y conserva el hash', async () => {
    const currentHash = await hashPassword(randomPassword(), COST);
    const result = await evaluatePasswordChange({ currentHash, currentPassword: randomPassword(), newPassword: randomPassword(), cost: COST });
    expect(result).toEqual({
      ok: false,
      hash: currentHash,
      errors: [{ field: 'currentPassword', message: PASSWORD_MESSAGES.currentPasswordIncorrect }],
    });
  });

  it('con la nueva de 7 caracteres rechaza en newPassword y conserva el hash', async () => {
    const current = randomPassword();
    const currentHash = await hashPassword(current, COST);
    const result = await evaluatePasswordChange({ currentHash, currentPassword: current, newPassword: TOO_SHORT, cost: COST });
    expect(result).toEqual({ ok: false, hash: currentHash, errors: [{ field: 'newPassword', message: PASSWORD_MESSAGES.newPasswordLength }] });
  });

  it('informa los dos motivos si ambos fallan', async () => {
    const currentHash = await hashPassword(randomPassword(), COST);
    const result = await evaluatePasswordChange({ currentHash, currentPassword: undefined, newPassword: TOO_LONG, cost: COST });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toEqual(['currentPassword', 'newPassword']);
    expect(result.hash).toBe(currentHash);
  });

  it('acepta el cambio sobre un hash clásico y deja el hash en el formato nuevo', async () => {
    const current = randomPassword();
    const legacy = await bcrypt.hash(current, COST);
    const next = randomPassword();
    const result = await evaluatePasswordChange({ currentHash: legacy, currentPassword: current, newPassword: next, cost: COST });
    expect(result.ok).toBe(true);
    expect(passwordHashFormat(result.hash)).toBe('bcrypt-sha256');
    expect(await verifyPassword(next, result.hash)).toBe(true);
  });
});

describe('evaluatePasswordReset', () => {
  it('acepta de 8 a 128 caracteres sin pedir la contraseña actual', async () => {
    const currentHash = await hashPassword(randomPassword(), COST);
    const next = randomPassword();
    const result = await evaluatePasswordReset({ currentHash, newPassword: next, cost: COST });
    expect(result.ok).toBe(true);
    expect(await verifyPassword(next, result.hash)).toBe(true);
  });

  it('rechaza fuera de rango y conserva el hash', async () => {
    const currentHash = await hashPassword(randomPassword(), COST);
    for (const newPassword of ['x'.repeat(7), 'x'.repeat(129)]) {
      expect(await evaluatePasswordReset({ currentHash, newPassword, cost: COST })).toEqual({
        ok: false,
        hash: currentHash,
        errors: [{ field: 'newPassword', message: PASSWORD_MESSAGES.newPasswordLength }],
      });
    }
  });
});
