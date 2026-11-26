// Rutas independientes del Módulo_Inventario_Limpieza (Req. 23 y 25).

import { Router } from 'express';
import { createCleaningInventoryController } from '../controllers/cleaning-inventory.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  movementBodySchema,
  productBodySchema,
  productIdParamSchema,
  productListQuerySchema,
  productMovementsQuerySchema,
} from '../schemas/cleaning-inventory';
import type { CleaningInventoryService } from '../services/cleaning-inventory.service';

const BASE = '/cleaning-inventory/products';

export function createCleaningInventoryRouter(deps: {
  service: CleaningInventoryService;
  security: Security;
}): Router {
  const router = Router();
  const controller = createCleaningInventoryController(deps.service);
  const { security } = deps;

  router.get(BASE, ...security.protect('cleaningInventory', 'list'), validate({ query: productListQuerySchema }), controller.list);
  router.post(BASE, ...security.protect('cleaningInventory', 'create'), validate({ body: productBodySchema }), controller.create);
  router.all(BASE, methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get(`${BASE}/:id`, ...security.protect('cleaningInventory', 'read'), validate({ params: productIdParamSchema }), controller.get);
  router.put(
    `${BASE}/:id`,
    ...security.protect('cleaningInventory', 'update'),
    validate({ params: productIdParamSchema, body: productBodySchema }),
    controller.update,
  );
  router.delete(
    `${BASE}/:id`,
    ...security.protect('cleaningInventory', 'delete'),
    validate({ params: productIdParamSchema }),
    controller.remove,
  );
  router.all(`${BASE}/:id`, methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.post(
    `${BASE}/:id/movements`,
    ...security.protect('cleaningInventory', 'create'),
    validate({ params: productIdParamSchema, body: movementBodySchema }),
    controller.move,
  );
  router.get(
    `${BASE}/:id/movements`,
    // CLEANING puede consultar Productos, pero nunca el historial de Movimientos (Req. 25.9).
    ...security.protect('inventoryMovements', 'list'),
    validate({ params: productIdParamSchema, query: productMovementsQuerySchema }),
    controller.productMovements,
  );
  router.all(`${BASE}/:id/movements`, methodNotAllowed(['GET', 'HEAD', 'POST']));

  return router;
}
