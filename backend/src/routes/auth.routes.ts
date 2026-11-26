// Rutas /api/auth (Req. 1, 5.12, 17).
// /me, /logout y /change-password requieren Sesión, pero no aplican requirePasswordChange: son las
// únicas permitidas mientras haya un cambio de contraseña pendiente. La recuperación es pública.

import { Router } from 'express';
import { createAuthController } from '../controllers/auth.controller';
import { createPasswordRecoveryController } from '../controllers/password-recovery.controller';
import type { AttemptLimiter } from '../middlewares/attemptLimiter';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import { ipKey, type Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import { changePasswordBodySchema, forgotPasswordBodySchema, loginBodySchema, resetPasswordBodySchema } from '../schemas/auth';
import type { AuthService } from '../services/auth.service';
import type { PasswordRecoveryService } from '../services/password-recovery.service';

export interface AuthRouterDeps {
  auth: AuthService;
  recovery: PasswordRecoveryService;
  security: Security;
  loginLimiter: AttemptLimiter;
  /** Límite propio de la recuperación (clave: IP); cuenta cada solicitud. */
  recoveryLimiter: AttemptLimiter;
  secureCookies: boolean;
}

export function createAuthRouter(deps: AuthRouterDeps): Router {
  const router = Router();
  const controller = createAuthController(deps.auth, deps.secureCookies);
  const recovery = createPasswordRecoveryController(deps.recovery);
  const { security } = deps;

  // Límite por IP antes de validar y de comparar credenciales (Req. 1.10).
  router.post('/auth/login', security.limitAttempts(deps.loginLimiter, ipKey), validate({ body: loginBodySchema }), controller.login);
  router.post('/auth/logout', security.authenticate, controller.logout);
  router.get('/auth/me', security.authenticate, controller.me);
  router.post('/auth/change-password', security.authenticate, validate({ body: changePasswordBodySchema }), controller.changePassword);

  // Recuperación (Req. 17.8): 429 si la IP está bloqueada; si no, la solicitud cuenta, exista o no la cuenta.
  router.post(
    '/auth/forgot-password',
    security.limitAttempts(deps.recoveryLimiter, ipKey),
    security.countAttempt(deps.recoveryLimiter, ipKey),
    validate({ body: forgotPasswordBodySchema }),
    recovery.forgotPassword,
  );
  router.post('/auth/reset-password', validate({ body: resetPasswordBodySchema }), recovery.resetPassword);

  for (const path of ['/auth/login', '/auth/logout', '/auth/change-password', '/auth/forgot-password', '/auth/reset-password']) {
    router.all(path, methodNotAllowed(['POST']));
  }
  router.all('/auth/me', methodNotAllowed(['GET', 'HEAD']));
  return router;
}
