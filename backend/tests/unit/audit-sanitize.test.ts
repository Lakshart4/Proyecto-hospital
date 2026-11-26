// Pruebas del saneador de detalles de auditoría (tarea 4.17; Req. 12.6, 17.9, 18.2).

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { auditKeySegments, isSecretAuditKey, sanitizeAuditDetails } from '../../src/domain/others';

/** Valor secreto de prueba generado en cada ejecución. */
const S = randomBytes(8).toString('hex');

describe('sanitizeAuditDetails', () => {
  it('elimina contraseñas, hashes, tokens, autorizaciones y cookies de sesión a cualquier profundidad', () => {
    const input = {
      email: 'a@example.com',
      password: S,
      user: { name: 'Ana', passwordHash: S, sessions: [{ id: 1, tokenHash: S }, { sid: S }] },
      reset: { token: S, expiresAt: '2026-01-01' },
      adminAuthorization: { aid: S },
      contraseña: S,
    };
    expect(sanitizeAuditDetails(input)).toEqual({
      email: 'a@example.com',
      user: { name: 'Ana', sessions: [{ id: 1 }, {}] },
      reset: { expiresAt: '2026-01-01' },
    });
  });

  it('no modifica el objeto recibido y conserva valores que no son objetos simples', () => {
    const when = new Date('2026-01-01T00:00:00Z');
    const input = { when, list: [1, 'dos', null], nested: { password: S } };
    const result = sanitizeAuditDetails(input);
    expect(result.when).toBe(when);
    expect(result.list).toEqual([1, 'dos', null]);
    expect(input.nested.password).toBe(S);
  });

  it('ejemplos aprobados: elimina por segmento completo y conserva los fragmentos accidentales', () => {
    for (const key of ['password', 'passwordHash', 'refreshToken', 'access_token', 'authorization', 'sid', 'aid', 'tokenCount', 'passwordChangedAt', 'resetTokenExpiresAt']) {
      expect(isSecretAuditKey(key)).toBe(true);
    }
    for (const key of ['hashtag', 'tokenizer', 'passwords', 'secretary', 'sidebar', 'aide', 'side']) {
      expect(isSecretAuditKey(key)).toBe(false);
    }
    const input = { hashtag: '#salud', tokenCount: 3, passwordChangedAt: '2026-01-01', resetTokenExpiresAt: '2026-01-02', sidebar: true, items: [{ refreshToken: S, access_token: S, note: 'x' }] };
    expect(sanitizeAuditDetails(input)).toEqual({ hashtag: '#salud', sidebar: true, items: [{ note: 'x' }] });
  });

  it('separa camelCase, snake_case, kebab-case, espacios, signos, números y acentos', () => {
    expect(auditKeySegments('resetToken2Hash')).toEqual(['reset', 'token', '2', 'hash']);
    expect(auditKeySegments('API-Token_value x.y')).toEqual(['api', 'token', 'value', 'x', 'y']);
    expect(auditKeySegments('HTTPAuthorization')).toEqual(['http', 'authorization']);
    expect(auditKeySegments('nuevaContraseña')).toEqual(['nueva', 'contrasena']);
    expect(auditKeySegments('Autorización Administrativa')).toEqual(['autorizacion', 'administrativa']);
    for (const key of ['SESSION_SECRET', 'X-Hash', 'hash2', 'v2Token', 'PASSWD']) expect(isSecretAuditKey(key)).toBe(true);
  });

  it('sid y aid solo como clave completa, sin distinguir mayúsculas', () => {
    for (const key of ['SID', 'Aid', 'sid', 'AID']) expect(isSecretAuditKey(key)).toBe(true);
    for (const key of ['sidValue', 'aid_code', 's-id', 'paid', 'said']) expect(isSecretAuditKey(key)).toBe(false);
  });

  it('reconoce las variantes de nombre y deja las claves normales', () => {
    for (const key of ['newPassword', 'PASSWORD', 'password_hash', 'resetToken', 'SESSION_SECRET', 'Contraseña', 'nuevaContrasena', 'autorizaciónAdministrativa', 'SID', 'aid']) {
      expect(isSecretAuditKey(key)).toBe(true);
    }
    for (const key of ['name', 'email', 'quantityBefore', 'roomId', 'reason', 'side', 'said', 'paid']) {
      expect(isSecretAuditKey(key)).toBe(false);
    }
  });
});
