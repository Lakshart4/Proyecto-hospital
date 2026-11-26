// Rutas de Equipos_Médicos y Registros_de_Mantenimiento (Req. 8, 26).

import { Router } from 'express';
import { createEquipmentController } from '../controllers/equipment.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  closeMaintenanceBodySchema,
  equipmentBodySchema,
  equipmentIdParamSchema,
  equipmentListQuerySchema,
  equipmentStatusBodySchema,
  maintenanceBodySchema,
  maintenanceIdParamSchema,
  maintenanceListQuerySchema,
} from '../schemas/equipment';
import type { EquipmentService } from '../services/equipment.service';

export function createEquipmentRouter(deps: { service: EquipmentService; security: Security }): Router {
  const router = Router();
  const controller = createEquipmentController(deps.service);
  const { security } = deps;

  router.get('/equipment/summary', ...security.protect('equipment', 'list'), controller.summary);
  router.all('/equipment/summary', methodNotAllowed(['GET', 'HEAD']));

  router.get('/equipment', ...security.protect('equipment', 'list'), validate({ query: equipmentListQuerySchema }), controller.list);
  router.post('/equipment', ...security.protect('equipment', 'create'), validate({ body: equipmentBodySchema }), controller.create);
  router.all('/equipment', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/equipment/:id', ...security.protect('equipment', 'read'), validate({ params: equipmentIdParamSchema }), controller.get);
  router.put(
    '/equipment/:id',
    ...security.protect('equipment', 'update'),
    validate({ params: equipmentIdParamSchema, body: equipmentBodySchema }),
    controller.update,
  );
  router.delete(
    '/equipment/:id',
    ...security.protect('equipment', 'delete'),
    validate({ params: equipmentIdParamSchema }),
    controller.remove,
  );
  router.all('/equipment/:id', methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.patch(
    '/equipment/:id/status',
    ...security.protect('equipment', 'update'),
    validate({ params: equipmentIdParamSchema, body: equipmentStatusBodySchema }),
    controller.changeStatus,
  );
  router.all('/equipment/:id/status', methodNotAllowed(['PATCH']));

  router.get(
    '/equipment/:id/maintenance',
    ...security.protect('maintenance', 'list'),
    validate({ params: equipmentIdParamSchema }),
    controller.equipmentMaintenance,
  );
  router.all('/equipment/:id/maintenance', methodNotAllowed(['GET', 'HEAD']));

  router.get('/maintenance', ...security.protect('maintenance', 'list'), validate({ query: maintenanceListQuerySchema }), controller.listMaintenance);
  router.post('/maintenance', ...security.protect('maintenance', 'create'), validate({ body: maintenanceBodySchema }), controller.open);
  router.all('/maintenance', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.post(
    '/maintenance/:id/close',
    ...security.protect('maintenance', 'update'),
    validate({ params: maintenanceIdParamSchema, body: closeMaintenanceBodySchema }),
    controller.close,
  );
  router.all('/maintenance/:id/close', methodNotAllowed(['POST']));

  return router;
}
