// Pruebas de vigencia del Token_de_Recuperación y de la Autorización_Administrativa (tarea 4.14;
// Req. 17.2, 17.5, 17.6, 18.1, 18.5, 18.7, 18.8). Los tokens se generan en cada ejecución.

import { describe, expect, it } from 'vitest';
import { ADMIN_AUTHORIZATION_TTL_MS, RESET_TOKEN_TTL_MS, isAdminAuthorizationValid, isResetTokenUsable } from '../../src/domain/tokens';
import { generateToken, hashToken } from '../../src/lib/tokens';

const CREATED = Date.UTC(2026, 3, 1, 9, 0, 0);
const at = (ms: number) => new Date(CREATED + ms);

describe('isResetTokenUsable', () => {
  const token = generateToken();
  const stored = { hash: hashToken(token), expiresAt: at(RESET_TOKEN_TTL_MS), usedAt: null };

  it('vigencia de 30 minutos', () => {
    expect(RESET_TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });

  it('es utilizable antes y en el instante exacto del vencimiento, y no 1 ms después', () => {
    expect(isResetTokenUsable(stored, hashToken(token), at(0))).toBe(true);
    expect(isResetTokenUsable(stored, hashToken(token), at(RESET_TOKEN_TTL_MS - 1))).toBe(true);
    expect(isResetTokenUsable(stored, hashToken(token), at(RESET_TOKEN_TTL_MS))).toBe(true);
    expect(isResetTokenUsable(stored, hashToken(token), at(RESET_TOKEN_TTL_MS + 1))).toBe(false);
  });

  it('un token usado no es utilizable aunque esté vigente', () => {
    expect(isResetTokenUsable({ ...stored, usedAt: at(1000) }, hashToken(token), at(2000))).toBe(false);
  });

  it('el hash presentado debe coincidir; el token en texto plano o un hash distinto no sirven', () => {
    expect(isResetTokenUsable(stored, hashToken(generateToken()), at(0))).toBe(false);
    expect(isResetTokenUsable(stored, token, at(0))).toBe(false);
    expect(isResetTokenUsable(stored, '', at(0))).toBe(false);
    expect(isResetTokenUsable(stored, stored.hash.toUpperCase(), at(0))).toBe(false);
  });

  it('rechaza fechas inválidas con RangeError', () => {
    expect(() => isResetTokenUsable(stored, stored.hash, new Date(Number.NaN))).toThrow(RangeError);
    expect(() => isResetTokenUsable({ ...stored, expiresAt: new Date('x') }, stored.hash, at(0))).toThrow(RangeError);
  });
});

describe('isAdminAuthorizationValid', () => {
  const authorization = { sessionId: 7, expiresAt: at(ADMIN_AUTHORIZATION_TTL_MS), revokedAt: null };

  it('vigencia de 10 minutos', () => {
    expect(ADMIN_AUTHORIZATION_TTL_MS).toBe(10 * 60 * 1000);
  });

  it('es válida antes del vencimiento y deja de serlo en el instante exacto y después', () => {
    expect(isAdminAuthorizationValid(authorization, 7, at(0))).toBe(true);
    expect(isAdminAuthorizationValid(authorization, 7, at(ADMIN_AUTHORIZATION_TTL_MS - 1))).toBe(true);
    expect(isAdminAuthorizationValid(authorization, 7, at(ADMIN_AUTHORIZATION_TTL_MS))).toBe(false);
    expect(isAdminAuthorizationValid(authorization, 7, at(ADMIN_AUTHORIZATION_TTL_MS + 1))).toBe(false);
  });

  it('una autorización de otra Sesión o revocada no es válida', () => {
    expect(isAdminAuthorizationValid(authorization, 8, at(0))).toBe(false);
    expect(isAdminAuthorizationValid({ ...authorization, revokedAt: at(1) }, 7, at(2))).toBe(false);
  });

  it('rechaza fechas inválidas con RangeError', () => {
    expect(() => isAdminAuthorizationValid(authorization, 7, new Date(Number.NaN))).toThrow(RangeError);
  });
});
