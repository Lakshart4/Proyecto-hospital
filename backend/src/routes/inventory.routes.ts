// Rutas del Inventario médico y del Inventario de limpieza (Req. 7, 22, 23, 25).

import { Router } from 'express';
import { createInventoryController } from '../controllers/inventory.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  movementBodySchema,
  movementListQuerySchema,
  productBodySchema,
  productIdParamSchema,
  productListQuerySchema,
  productMovementsQuerySchema,
} from '../schemas/inventory';
import type { InventoryArea, InventoryService } from '../services/inventory.service';

export function createInventoryRouter(deps: {
  service: InventoryService;
  security: Security;
  area: InventoryArea;
}): Router {
  const router = Router();
  const controller = createInventoryController(deps.service);
  const { security, area } = deps;
  const resource = area === 'medical' ? 'inventory' : 'cleaningInventory';
  const base = area === 'medical' ? '/inventory/products' : '/cleaning-inventory/products';

  router.get(base, ...security.protect(resource, 'list'), validate({ query: productListQuerySchema }), controller.list);
  router.post(base, ...security.protect(resource, 'create'), validate({ body: productBodySchema }), controller.create);
  router.all(base, methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get(`${base}/:id`, ...security.protect(resource, 'read'), validate({ params: productIdParamSchema }), controller.get);
  router.put(
    `${base}/:id`,
    ...security.protect(resource, 'update'),
    validate({ params: productIdParamSchema, body: productBodySchema }),
    controller.update,
  );
  router.delete(
    `${base}/:id`,
    ...security.protect(resource, 'delete'),
    validate({ params: productIdParamSchema }),
    controller.remove,
  );
  router.all(`${base}/:id`, methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.post(
    `${base}/:id/movements`,
    ...security.protect(resource, 'create'),
    validate({ params: productIdParamSchema, body: movementBodySchema }),
    controller.move,
  );
  router.get(
    `${base}/:id/movements`,
    // El historial de movimientos es exclusivo de ADMIN incluso cuando el Producto
    // pertenece al inventario que CLEANING puede consultar (Req. 25.9).
    ...security.protect('inventoryMovements', 'list'),
    validate({ params: productIdParamSchema, query: productMovementsQuerySchema }),
    controller.productMovements,
  );
  router.all(`${base}/:id/movements`, methodNotAllowed(['GET', 'HEAD', 'POST']));

  if (area === 'medical') {
    router.get(
      '/inventory/movements',
      ...security.protect('inventoryMovements', 'list'),
      validate({ query: movementListQuerySchema }),
      controller.movements,
    );
    router.all('/inventory/movements', methodNotAllowed(['GET', 'HEAD']));
    router.all('/inventory/movements/:id', methodNotAllowed(['GET', 'HEAD']));
  }

  return router;
}
