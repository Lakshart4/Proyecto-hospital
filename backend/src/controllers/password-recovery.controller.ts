// Controlador de recuperación de contraseña (Req. 17.1, 17.5–17.7).

import type { RequestHandler } from 'express';
import { RESET_COMPLETED_MESSAGE, RESET_REQUESTED_MESSAGE, type PasswordRecoveryService } from '../services/password-recovery.service';

export function createPasswordRecoveryController(recovery: PasswordRecoveryService) {
  const forgotPassword: RequestHandler = async (req, res) => {
    const { email } = req.body as { email: string };
    await recovery.requestReset(email);
    res.status(200).json({ message: RESET_REQUESTED_MESSAGE });
  };

  const resetPassword: RequestHandler = async (req, res) => {
    const { token, newPassword } = req.body as { token: string; newPassword: string };
    await recovery.resetPassword(token, newPassword);
    res.status(200).json({ message: RESET_COMPLETED_MESSAGE });
  };

  return { forgotPassword, resetPassword };
}
