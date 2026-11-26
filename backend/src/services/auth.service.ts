// Servicio de autenticación (Req. 1.1–1.11, 5.12, 12.2, 18.5, 18.7).
//
// - Sesiones del lado del servidor: el cliente recibe un token aleatorio de 32 bytes y la base guarda
//   solo su hash SHA-256 (`Session.tokenHash`).
// - Inicio de sesión: siempre compara con bcrypt (con un hash ficticio si la cuenta no existe) y
//   responde el mismo 401 genérico si la cuenta no existe, está inactiva o la contraseña no coincide.
//   Los fallos cuentan en el límite de intentos por IP; un inicio correcto reinicia el contador.
// - Cada inicio correcto o fallido se audita (LOGIN_SUCCESS / LOGIN_FAILURE). En el fallo, `userId`
//   es nulo si la cuenta no existe y los detalles son solo `{ email }`.
// - Cambio de contraseña: reglas de lib/password.ts; conserva la Sesión actual, borra las demás,
//   revoca las Autorizaciones_Administrativas del usuario y audita PASSWORD_CHANGE, todo en una
//   transacción.

import type { Role } from '../domain/constants';
import { isAdminAuthorizationValid, isSessionExpired } from '../domain/tokens';
import { UnauthenticatedError, ValidationError } from '../lib/errors';
import { BCRYPT_COST, evaluatePasswordChange, hashPassword, verifyPassword } from '../lib/password';
import { generateToken, hashToken } from '../lib/tokens';
import type { AttemptLimiter } from '../middlewares/attemptLimiter';
import { writeAudit } from '../repositories/audit.repository';
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  findAccountByEmail,
  findAccountById,
  findAdminAuthorizationByTokenHash,
  findSessionByTokenHash,
  revokeAdminAuthorizationsOfUser,
  touchSession,
  updatePasswordHash,
} from '../repositories/auth.repository';
import type { Database } from '../repositories/database';
import { withTransaction } from '../repositories/transaction';

export const INVALID_CREDENTIALS_MESSAGE = 'Credenciales incorrectas.';
export const PASSWORD_CHANGED_MESSAGE = 'La contraseña se cambió correctamente.';

/** Usuario que se devuelve al cliente (sin hash ni datos internos). */
export interface PublicUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

/** Contexto de la solicitud autenticada. */
export interface AuthContext {
  sessionId: number;
  user: PublicUser;
}

export interface AuthServiceOptions {
  db: Database;
  now: () => Date;
  /** Límite de intentos del inicio de sesión (clave: IP). */
  loginLimiter: AttemptLimiter;
  bcryptCost?: number;
}

const toPublicUser = (u: PublicUser): PublicUser => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
});

export function createAuthService(options: AuthServiceOptions) {
  const { db, now, loginLimiter } = options;
  const cost = options.bcryptCost ?? BCRYPT_COST;
  let dummyHash: Promise<string> | undefined;
  // Hash de una contraseña aleatoria para comparar cuando la cuenta no existe (mismo costo de tiempo).
  const getDummyHash = () => (dummyHash ??= hashPassword(generateToken(), cost));

  return {
    /** @throws UnauthenticatedError (401, mensaje genérico) si las credenciales no son válidas. */
    async login(email: string, password: string, ip: string): Promise<{ token: string; user: PublicUser }> {
      const account = await findAccountByEmail(db, email);
      const passwordOk = await verifyPassword(password, account?.passwordHash ?? (await getDummyHash()));

      if (account === null || !account.active || !passwordOk) {
        loginLimiter.registerFailure(ip, now());
        await withTransaction(
          (tx) =>
            writeAudit(tx, {
              userId: account?.id ?? null,
              action: 'LOGIN_FAILURE',
              entityType: 'User',
              entityId: account?.id ?? null,
              details: { email },
            }),
          { client: db },
        );
        throw new UnauthenticatedError(INVALID_CREDENTIALS_MESSAGE);
      }

      const token = generateToken();
      await withTransaction(
        async (tx) => {
          const session = await createSession(tx, { tokenHash: hashToken(token), userId: account.id, now: now() });
          await writeAudit(tx, { userId: account.id, action: 'LOGIN_SUCCESS', entityType: 'Session', entityId: session.id });
        },
        { client: db },
      );
      loginLimiter.reset(ip);
      return { token, user: toPublicUser(account) };
    },

    /**
     * Sesión del token de la cookie. Devuelve null (401) si no existe, expiró por inactividad (se borra)
     * o la cuenta está inactiva (se borra). Si es válida, actualiza `lastActivityAt`.
     */
    async authenticate(token: string): Promise<AuthContext | null> {
      const session = await findSessionByTokenHash(db, hashToken(token));
      if (session === null) return null;
      const current = now();
      if (isSessionExpired(session.lastActivityAt, current) || !session.user.active) {
        await deleteSession(db, session.id);
        return null;
      }
      await touchSession(db, session.id, current);
      return { sessionId: session.id, user: toPublicUser(session.user) };
    },

    async logout(sessionId: number): Promise<void> {
      await deleteSession(db, sessionId);
    },

    /** Autorización_Administrativa del token de la cookie `aid` vigente para la Sesión actual. */
    async hasValidAdminAuthorization(token: string, sessionId: number): Promise<boolean> {
      const authorization = await findAdminAuthorizationByTokenHash(db, hashToken(token));
      return authorization !== null && isAdminAuthorizationValid(authorization, sessionId, now());
    },

    /** @throws ValidationError (400) con errores por campo; el hash no cambia. */
    async changePassword(context: AuthContext, currentPassword: unknown, newPassword: unknown): Promise<void> {
      const account = await findAccountById(db, context.user.id);
      if (account === null || !account.active) throw new UnauthenticatedError();
      const result = await evaluatePasswordChange({ currentHash: account.passwordHash, currentPassword, newPassword, cost });
      if (!result.ok) throw new ValidationError('No se pudo cambiar la contraseña.', result.errors);

      await withTransaction(
        async (tx) => {
          await updatePasswordHash(tx, account.id, result.hash);
          await deleteOtherSessions(tx, account.id, context.sessionId);
          await revokeAdminAuthorizationsOfUser(tx, account.id, now());
          await writeAudit(tx, { userId: account.id, action: 'PASSWORD_CHANGE', entityType: 'User', entityId: account.id });
        },
        { client: db },
      );
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
