// Pruebas de tokens aleatorios y expiración de sesión (tarea 4.1; Req. 1.5, 17.2).

import { describe, expect, it } from 'vitest';
import { SESSION_IDLE_TIMEOUT_MS, isSessionExpired } from '../../src/domain/tokens';
import { TOKEN_BYTES, generateToken, hashToken } from '../../src/lib/tokens';

describe('generateToken y hashToken', () => {
  it('genera 32 bytes en base64url (43 caracteres), distintos en cada llamada', () => {
    const tokens = Array.from({ length: 200 }, generateToken);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(Buffer.from(token, 'base64url')).toHaveLength(TOKEN_BYTES);
    }
    expect(new Set(tokens).size).toBe(tokens.length);
  });

  it('el hash es SHA-256 en hexadecimal, determinista y distinto del token', () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
    expect(hashToken(`${token}x`)).not.toBe(hash);
    // Vector conocido de SHA-256 (cadena "abc").
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('isSessionExpired', () => {
  const last = new Date('2026-03-01T10:00:00.000Z');
  const at = (ms: number) => new Date(last.getTime() + ms);

  it('30 minutos exactos no expira; 30 minutos y 1 ms sí', () => {
    expect(SESSION_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000);
    expect(isSessionExpired(last, at(0))).toBe(false);
    expect(isSessionExpired(last, at(SESSION_IDLE_TIMEOUT_MS - 1))).toBe(false);
    expect(isSessionExpired(last, at(SESSION_IDLE_TIMEOUT_MS))).toBe(false);
    expect(isSessionExpired(last, at(SESSION_IDLE_TIMEOUT_MS + 1))).toBe(true);
    expect(isSessionExpired(last, at(24 * 3_600_000))).toBe(true);
  });

  it('rechaza fechas inválidas con RangeError', () => {
    expect(() => isSessionExpired(new Date(Number.NaN), last)).toThrow(RangeError);
    expect(() => isSessionExpired(last, new Date('no es fecha'))).toThrow(RangeError);
  });
});
