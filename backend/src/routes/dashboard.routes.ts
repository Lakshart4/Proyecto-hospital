// Rutas del Dashboard administrativo (Req. 4.7).

import { Router } from 'express';
import { createDashboardController } from '../controllers/dashboard.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import type { DashboardService } from '../services/dashboard.service';

export function createDashboardRouter(deps: { service: DashboardService; security: Security }): Router {
  const router = Router();
  const controller = createDashboardController(deps.service);

  router.get('/dashboard', ...deps.security.protect('dashboard', 'list'), controller.get);
  router.all('/dashboard', methodNotAllowed(['GET', 'HEAD']));

  return router;
}
