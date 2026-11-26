// Rutas de Proveedores y Entregas_de_Proveedor (Req. 7.12, 24).

import { Router } from 'express';
import { createSuppliersController } from '../controllers/suppliers.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  deliveryBodySchema,
  deliveryIdParamSchema,
  deliveryListQuerySchema,
  receiveDeliveryBodySchema,
  supplierBodySchema,
  supplierIdParamSchema,
  supplierSearchQuerySchema,
} from '../schemas/suppliers';
import type { SuppliersService } from '../services/suppliers.service';

export function createSuppliersRouter(deps: { service: SuppliersService; security: Security }): Router {
  const router = Router();
  const controller = createSuppliersController(deps.service);
  const { security } = deps;

  router.get('/suppliers', ...security.protect('suppliers', 'list'), validate({ query: supplierSearchQuerySchema }), controller.listSuppliers);
  router.post('/suppliers', ...security.protect('suppliers', 'create'), validate({ body: supplierBodySchema }), controller.createSupplier);
  router.all('/suppliers', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/suppliers/:id', ...security.protect('suppliers', 'read'), validate({ params: supplierIdParamSchema }), controller.getSupplier);
  router.put(
    '/suppliers/:id',
    ...security.protect('suppliers', 'update'),
    validate({ params: supplierIdParamSchema, body: supplierBodySchema }),
    controller.updateSupplier,
  );
  router.delete(
    '/suppliers/:id',
    ...security.protect('suppliers', 'delete'),
    validate({ params: supplierIdParamSchema }),
    controller.removeSupplier,
  );
  router.all('/suppliers/:id', methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.get('/deliveries', ...security.protect('deliveries', 'list'), validate({ query: deliveryListQuerySchema }), controller.listDeliveries);
  router.post('/deliveries', ...security.protect('deliveries', 'create'), validate({ body: deliveryBodySchema }), controller.createDelivery);
  router.all('/deliveries', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/deliveries/:id', ...security.protect('deliveries', 'read'), validate({ params: deliveryIdParamSchema }), controller.getDelivery);
  router.put(
    '/deliveries/:id',
    ...security.protect('deliveries', 'update'),
    validate({ params: deliveryIdParamSchema, body: deliveryBodySchema }),
    controller.updateDelivery,
  );
  router.all('/deliveries/:id', methodNotAllowed(['GET', 'HEAD', 'PUT']));

  router.post(
    '/deliveries/:id/receive',
    ...security.protect('deliveries', 'update'),
    validate({ params: deliveryIdParamSchema, body: receiveDeliveryBodySchema }),
    controller.receive,
  );
  router.all('/deliveries/:id/receive', methodNotAllowed(['POST']));

  router.post(
    '/deliveries/:id/cancel',
    ...security.protect('deliveries', 'update'),
    validate({ params: deliveryIdParamSchema }),
    controller.cancel,
  );
  router.all('/deliveries/:id/cancel', methodNotAllowed(['POST']));

  return router;
}
