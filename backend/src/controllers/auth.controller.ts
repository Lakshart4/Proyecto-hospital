// Controlador del módulo auth: traduce HTTP a llamadas del servicio (Req. 1.1–1.11, 13.1).

import type { RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import { SESSION_COOKIE, clearAuthCookies, cookieOptions, ipKey } from '../middlewares/security';
import { PASSWORD_CHANGED_MESSAGE, type AuthService } from '../services/auth.service';

export function createAuthController(auth: AuthService, secureCookies: boolean) {
  const login: RequestHandler = async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    const result = await auth.login(email, password, ipKey(req));
    res.cookie(SESSION_COOKIE, result.token, cookieOptions(secureCookies));
    res.status(200).json({ user: result.user });
  };

  const logout: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    await auth.logout(req.auth.sessionId);
    clearAuthCookies(res, secureCookies);
    res.status(204).end();
  };

  const me: RequestHandler = (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    res.status(200).json({ user: req.auth.user });
  };

  const changePassword: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    await auth.changePassword(req.auth, currentPassword, newPassword);
    res.status(200).json({ message: PASSWORD_CHANGED_MESSAGE });
  };

  return { login, logout, me, changePassword };
}
