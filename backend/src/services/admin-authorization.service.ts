// Autorización_Administrativa (Req. 18.1–18.8, 18.10, 12.2).
//
// Solo ADMIN (lo comprueba `authorize` en la ruta). Se otorga con la contraseña propia del Administrador
// y queda ligada a la Sesión actual durante 10 minutos; la base guarda solo el hash del token y el cliente
// lo recibe en la cookie firmada `aid`. Cada otorgamiento o rechazo se audita en la misma transacción.
// Límite de intentos propio (clave: id del usuario): los rechazos cuentan y un otorgamiento correcto
// reinicia el contador. Se invalida al cerrar o expirar la Sesión (cascada), al cambiar la contraseña
// (auth.service) o con `revoke`.

import { ADMIN_AUTHORIZATION_TTL_MS, isAdminAuthorizationValid } from '../domain/tokens';
import { UnauthenticatedError } from '../lib/errors';
import { verifyPassword } from '../lib/password';
import { generateToken, hashToken } from '../lib/tokens';
import type { AttemptLimiter } from '../middlewares/attemptLimiter';
import { writeAudit } from '../repositories/audit.repository';
import {
  findAccountById,
  findAdminAuthorizationBySession,
  revokeAdminAuthorizationOfSession,
  upsertAdminAuthorization,
} from '../repositories/auth.repository';
import type { Database } from '../repositories/database';
import { withTransaction } from '../repositories/transaction';
import type { AuthContext } from './auth.service';

export const ADMIN_AUTH_REJECTED_MESSAGE = 'La contraseña es incorrecta.';

export interface AdminAuthorizationOptions {
  db: Database;
  now: () => Date;
  limiter: AttemptLimiter;
}

/** Clave del límite de intentos de la autorización administrativa. */
export const adminAuthKey = (context: AuthContext): string => `user:${context.user.id}`;

export function createAdminAuthorizationService(options: AdminAuthorizationOptions) {
  const { db, now, limiter } = options;

  return {
    /** @throws UnauthenticatedError (401) si la contraseña es incorrecta (rechazo auditado). */
    async grant(context: AuthContext, password: string): Promise<{ token: string; expiresAt: Date }> {
      const account = await findAccountById(db, context.user.id);
      const ok = account !== null && account.active && (await verifyPassword(password, account.passwordHash));
      if (!ok) {
        limiter.registerFailure(adminAuthKey(context), now());
        await withTransaction(
          (tx) => writeAudit(tx, { userId: context.user.id, action: 'ADMIN_AUTH_REJECTED', entityType: 'Session', entityId: context.sessionId }),
          { client: db },
        );
        throw new UnauthenticatedError(ADMIN_AUTH_REJECTED_MESSAGE);
      }

      const token = generateToken();
      const grantedAt = now();
      const expiresAt = new Date(grantedAt.getTime() + ADMIN_AUTHORIZATION_TTL_MS);
      await withTransaction(
        async (tx) => {
          await upsertAdminAuthorization(tx, { sessionId: context.sessionId, userId: context.user.id, tokenHash: hashToken(token), expiresAt, now: grantedAt });
          await writeAudit(tx, { userId: context.user.id, action: 'ADMIN_AUTH_GRANTED', entityType: 'Session', entityId: context.sessionId });
        },
        { client: db },
      );
      limiter.reset(adminAuthKey(context));
      return { token, expiresAt };
    },

    /** Estado de la autorización de la Sesión actual presentada en la cookie `aid`. */
    async status(context: AuthContext, token: string | null): Promise<{ active: boolean; expiresAt: Date | null }> {
      const stored = await findAdminAuthorizationBySession(db, context.sessionId);
      const active =
        stored !== null && token !== null && stored.tokenHash === hashToken(token) && isAdminAuthorizationValid(stored, context.sessionId, now());
      return { active, expiresAt: active && stored ? stored.expiresAt : null };
    },

    async revoke(context: AuthContext): Promise<void> {
      await revokeAdminAuthorizationOfSession(db, context.sessionId, now());
    },
  };
}

export type AdminAuthorizationService = ReturnType<typeof createAdminAuthorizationService>;
