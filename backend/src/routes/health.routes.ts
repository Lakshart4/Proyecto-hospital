import { Router } from 'express';
import { getHealth } from '../controllers/health.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';

export function createHealthRouter(): Router {
  const router = Router();
  router.get('/health', getHealth);
  router.all('/health', methodNotAllowed(['GET', 'HEAD']));
  return router;
}
