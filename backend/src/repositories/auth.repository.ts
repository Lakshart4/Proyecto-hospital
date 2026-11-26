// Acceso a datos de cuentas, Sesiones y Autorizaciones_Administrativas (Req. 1, 18).
// Solo guarda y busca hashes de tokens; nunca recibe tokens en texto plano.

import type { Role } from '../domain/constants';
import type { Database } from './database';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

/** Datos de la cuenta que necesita la autenticación. Nunca incluye el hash fuera del servicio. */
export interface AccountRecord {
  id: number;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  mustChangePassword: boolean;
  passwordHash: string;
}

const ACCOUNT_SELECT = { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true, passwordHash: true } as const;

export async function findAccountByEmail(db: Client, email: string): Promise<AccountRecord | null> {
  return (await db.user.findUnique({ where: { email }, select: ACCOUNT_SELECT })) as AccountRecord | null;
}

export async function findAccountById(db: Client, id: number): Promise<AccountRecord | null> {
  return (await db.user.findUnique({ where: { id }, select: ACCOUNT_SELECT })) as AccountRecord | null;
}

export async function updatePasswordHash(db: Client, userId: number, passwordHash: string): Promise<void> {
  await db.user.update({ where: { id: userId }, data: { passwordHash, mustChangePassword: false } });
}

// ---------- Sesiones ----------

export interface SessionRecord {
  id: number;
  userId: number;
  lastActivityAt: Date;
  user: Omit<AccountRecord, 'passwordHash'>;
}

export async function createSession(db: Client, data: { tokenHash: string; userId: number; now: Date }): Promise<{ id: number }> {
  return db.session.create({
    data: { tokenHash: data.tokenHash, userId: data.userId, createdAt: data.now, lastActivityAt: data.now },
    select: { id: true },
  });
}

export async function findSessionByTokenHash(db: Client, tokenHash: string): Promise<SessionRecord | null> {
  const session = await db.session.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      lastActivityAt: true,
      user: { select: { id: true, email: true, name: true, role: true, active: true, mustChangePassword: true } },
    },
  });
  return session as SessionRecord | null;
}

export async function touchSession(db: Client, sessionId: number, now: Date): Promise<void> {
  await db.session.update({ where: { id: sessionId }, data: { lastActivityAt: now } });
}

/** Borra la Sesión; su Autorización_Administrativa cae por cascada. */
export async function deleteSession(db: Client, sessionId: number): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

/** Borra todas las Sesiones del usuario (sus Autorizaciones_Administrativas caen por cascada). */
export async function deleteAllSessions(db: Client, userId: number): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

// ---------- Tokens_de_Recuperación ----------

export async function invalidateResetTokens(db: Client, userId: number, now: Date): Promise<void> {
  await db.passwordResetToken.updateMany({ where: { userId, usedAt: null }, data: { usedAt: now } });
}

export async function createResetToken(db: Client, data: { userId: number; tokenHash: string; expiresAt: Date; now: Date }): Promise<void> {
  await db.passwordResetToken.create({
    data: { userId: data.userId, tokenHash: data.tokenHash, expiresAt: data.expiresAt, createdAt: data.now },
  });
}

export async function findResetTokenByHash(
  db: Client,
  tokenHash: string,
): Promise<{ id: number; userId: number; tokenHash: string; expiresAt: Date; usedAt: Date | null } | null> {
  return db.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true, tokenHash: true, expiresAt: true, usedAt: true } });
}

/** Marca el token como usado solo si sigue sin usar; devuelve false si otro proceso lo usó antes. */
export async function markResetTokenUsed(db: Client, id: number, now: Date): Promise<boolean> {
  const result = await db.passwordResetToken.updateMany({ where: { id, usedAt: null }, data: { usedAt: now } });
  return result.count === 1;
}

export async function deleteOtherSessions(db: Client, userId: number, keepSessionId: number): Promise<void> {
  await db.session.deleteMany({ where: { userId, id: { not: keepSessionId } } });
}

// ---------- Autorizaciones_Administrativas ----------

export async function findAdminAuthorizationByTokenHash(
  db: Client,
  tokenHash: string,
): Promise<{ sessionId: number; expiresAt: Date; revokedAt: Date | null } | null> {
  return db.adminAuthorization.findUnique({ where: { tokenHash }, select: { sessionId: true, expiresAt: true, revokedAt: true } });
}

export async function findAdminAuthorizationBySession(
  db: Client,
  sessionId: number,
): Promise<{ id: number; tokenHash: string; sessionId: number; expiresAt: Date; revokedAt: Date | null } | null> {
  return db.adminAuthorization.findUnique({
    where: { sessionId },
    select: { id: true, tokenHash: true, sessionId: true, expiresAt: true, revokedAt: true },
  });
}

/** Crea (o reemplaza) la única Autorización_Administrativa de la Sesión. */
export async function upsertAdminAuthorization(
  db: Client,
  data: { sessionId: number; userId: number; tokenHash: string; expiresAt: Date; now: Date },
): Promise<void> {
  await db.adminAuthorization.upsert({
    where: { sessionId: data.sessionId },
    create: { sessionId: data.sessionId, userId: data.userId, tokenHash: data.tokenHash, expiresAt: data.expiresAt, createdAt: data.now },
    update: { tokenHash: data.tokenHash, expiresAt: data.expiresAt, revokedAt: null, createdAt: data.now },
  });
}

export async function revokeAdminAuthorizationOfSession(db: Client, sessionId: number, now: Date): Promise<void> {
  await db.adminAuthorization.updateMany({ where: { sessionId, revokedAt: null }, data: { revokedAt: now } });
}

/** Revoca todas las Autorizaciones_Administrativas vigentes del usuario (cambio de contraseña, Req. 18.7). */
export async function revokeAdminAuthorizationsOfUser(db: Client, userId: number, now: Date): Promise<void> {
  await db.adminAuthorization.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
}
