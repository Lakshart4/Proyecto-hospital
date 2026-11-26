// Recuperación de contraseña por correo (Req. 17.1–17.9, 12.2).
//
// Solicitud: siempre la misma respuesta. Si el correo es de una cuenta activa, invalida los tokens
// previos, guarda solo el hash SHA-256 de un token nuevo de 32 bytes con vigencia de 30 minutos y audita
// PASSWORD_RESET_REQUEST (sin token) en una transacción; después envía el enlace con MailService. Un fallo
// de envío no cambia la respuesta.
// Restablecimiento: valida primero la contraseña nueva (si es inválida, el token sigue vigente); luego el
// token con `isResetTokenUsable`. Si todo es válido, en una transacción: marca el token como usado,
// guarda el hash nuevo (sin cambio pendiente), revoca las Autorizaciones_Administrativas, borra todas las
// Sesiones del usuario y audita PASSWORD_RESET_COMPLETE.

import { RESET_TOKEN_TTL_MS, isResetTokenUsable } from '../domain/tokens';
import { ValidationError } from '../lib/errors';
import { BCRYPT_COST, evaluatePasswordReset, validateNewPassword } from '../lib/password';
import { generateToken, hashToken } from '../lib/tokens';
import { passwordResetEmail, type MailService } from '../mail/mail.service';
import { writeAudit } from '../repositories/audit.repository';
import {
  createResetToken,
  deleteAllSessions,
  findAccountByEmail,
  findAccountById,
  findResetTokenByHash,
  invalidateResetTokens,
  markResetTokenUsed,
  revokeAdminAuthorizationsOfUser,
  updatePasswordHash,
} from '../repositories/auth.repository';
import type { Database } from '../repositories/database';
import { withTransaction } from '../repositories/transaction';

export const RESET_REQUESTED_MESSAGE = 'Si el correo corresponde a una cuenta activa, recibirás un enlace para restablecer tu contraseña.';
export const RESET_COMPLETED_MESSAGE = 'La contraseña se restableció correctamente. Inicia sesión con tu nueva contraseña.';
export const INVALID_RESET_LINK_MESSAGE = 'El enlace es inválido o venció.';

export interface PasswordRecoveryOptions {
  db: Database;
  now: () => Date;
  mail: MailService;
  frontendUrl: string;
  bcryptCost?: number;
}

const invalidLink = () => new ValidationError(INVALID_RESET_LINK_MESSAGE, [{ field: 'token', message: INVALID_RESET_LINK_MESSAGE }]);

export function createPasswordRecoveryService(options: PasswordRecoveryOptions) {
  const { db, now, mail } = options;
  const cost = options.bcryptCost ?? BCRYPT_COST;

  return {
    async requestReset(email: string): Promise<void> {
      const account = await findAccountByEmail(db, email);
      if (account === null || !account.active) return;

      const token = generateToken();
      const issuedAt = now();
      await withTransaction(
        async (tx) => {
          await invalidateResetTokens(tx, account.id, issuedAt);
          await createResetToken(tx, {
            userId: account.id,
            tokenHash: hashToken(token),
            expiresAt: new Date(issuedAt.getTime() + RESET_TOKEN_TTL_MS),
            now: issuedAt,
          });
          await writeAudit(tx, { userId: account.id, action: 'PASSWORD_RESET_REQUEST', entityType: 'User', entityId: account.id });
        },
        { client: db },
      );
      await mail.send(passwordResetEmail(account.email, options.frontendUrl, token));
    },

    /** @throws ValidationError (400): contraseña fuera de rango (token intacto) o enlace inválido o vencido. */
    async resetPassword(token: string, newPassword: unknown): Promise<void> {
      const passwordErrors = validateNewPassword(newPassword);
      if (passwordErrors.length > 0) throw new ValidationError('La nueva contraseña no es válida.', passwordErrors);

      const presentedHash = hashToken(token);
      const stored = await findResetTokenByHash(db, presentedHash);
      const current = now();
      if (stored === null || !isResetTokenUsable({ hash: stored.tokenHash, expiresAt: stored.expiresAt, usedAt: stored.usedAt }, presentedHash, current)) {
        throw invalidLink();
      }
      const account = await findAccountById(db, stored.userId);
      if (account === null || !account.active) throw invalidLink();

      const result = await evaluatePasswordReset({ currentHash: account.passwordHash, newPassword, cost });
      if (!result.ok) throw new ValidationError('La nueva contraseña no es válida.', result.errors);

      await withTransaction(
        async (tx) => {
          if (!(await markResetTokenUsed(tx, stored.id, current))) throw invalidLink();
          await updatePasswordHash(tx, account.id, result.hash);
          await revokeAdminAuthorizationsOfUser(tx, account.id, current);
          await deleteAllSessions(tx, account.id);
          await writeAudit(tx, { userId: account.id, action: 'PASSWORD_RESET_COMPLETE', entityType: 'User', entityId: account.id });
        },
        { client: db },
      );
    },
  };
}

export type PasswordRecoveryService = ReturnType<typeof createPasswordRecoveryService>;
