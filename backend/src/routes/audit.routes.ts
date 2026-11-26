// Rutas de solo lectura de la Bitácora_de_Auditoría (Req. 12.3–12.7).

import { Router } from 'express';
import { createAuditController } from '../controllers/audit.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import { auditListQuerySchema } from '../schemas/audit';
import type { AuditService } from '../services/audit.service';

export function createAuditRouter(deps: { service: AuditService; security: Security }): Router {
  const router = Router();
  const controller = createAuditController(deps.service);

  router.get('/audit', ...deps.security.protect('audit', 'list'), validate({ query: auditListQuerySchema }), controller.list);
  router.all('/audit', methodNotAllowed(['GET', 'HEAD']));
  router.all('/audit/:id', methodNotAllowed([]));

  return router;
}
