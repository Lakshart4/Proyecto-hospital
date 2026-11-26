// Rutas /api/admin-authorization (Req. 18). Solo ADMIN; otros roles reciben 403 sin otorgar nada.
// Orden: authenticate (401) → requirePasswordChange → authorize (403) → límite por usuario (429, antes
// de comparar la contraseña) → validate (400) → controlador.

import { Router } from 'express';
import { createAdminAuthorizationController } from '../controllers/admin-authorization.controller';
import type { AttemptLimiter } from '../middlewares/attemptLimiter';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import { adminAuthorizationBodySchema } from '../schemas/auth';
import { adminAuthKey, type AdminAuthorizationService } from '../services/admin-authorization.service';

export function createAdminAuthorizationRouter(deps: {
  service: AdminAuthorizationService;
  security: Security;
  limiter: AttemptLimiter;
  secureCookies: boolean;
}): Router {
  const router = Router();
  const controller = createAdminAuthorizationController(deps.service, deps.secureCookies);
  const { security } = deps;
  router.post(
    '/admin-authorization',
    ...security.protect('adminAuthorization', 'create'),
    security.limitAttempts(deps.limiter, (req) => (req.auth ? adminAuthKey(req.auth) : 'sin-sesion')),
    validate({ body: adminAuthorizationBodySchema }),
    controller.grant,
  );
  router.get('/admin-authorization', ...security.protect('adminAuthorization', 'read'), controller.status);
  router.delete('/admin-authorization', ...security.protect('adminAuthorization', 'delete'), controller.revoke);
  router.all('/admin-authorization', methodNotAllowed(['GET', 'HEAD', 'POST', 'DELETE']));
  return router;
}
