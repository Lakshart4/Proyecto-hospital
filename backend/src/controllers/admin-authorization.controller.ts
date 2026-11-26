// Controlador de la Autorización_Administrativa (Req. 18.1, 18.3, 18.7).

import type { RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import { ADMIN_AUTH_COOKIE, cookieOptions, signedCookie } from '../middlewares/security';
import type { AdminAuthorizationService } from '../services/admin-authorization.service';

export function createAdminAuthorizationController(service: AdminAuthorizationService, secureCookies: boolean) {
  const grant: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    const { password } = req.body as { password: string };
    const { token, expiresAt } = await service.grant(req.auth, password);
    res.cookie(ADMIN_AUTH_COOKIE, token, cookieOptions(secureCookies));
    res.status(201).json({ expiresAt: expiresAt.toISOString() });
  };

  const status: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    const result = await service.status(req.auth, signedCookie(req, ADMIN_AUTH_COOKIE));
    res.status(200).json({ active: result.active, expiresAt: result.expiresAt?.toISOString() ?? null });
  };

  const revoke: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    await service.revoke(req.auth);
    const { signed: _signed, ...options } = cookieOptions(secureCookies);
    res.clearCookie(ADMIN_AUTH_COOKIE, options);
    res.status(204).end();
  };

  return { grant, status, revoke };
}
