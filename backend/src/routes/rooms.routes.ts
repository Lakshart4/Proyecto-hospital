// Rutas de Habitaciones, Asignaciones, liberaciones e Historial_de_Ocupación (Req. 9, 27).

import { Router } from 'express';
import { createRoomsController } from '../controllers/rooms.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  assignmentBodySchema,
  occupancyListQuerySchema,
  occupancySummaryQuerySchema,
  releaseBodySchema,
  roomBodySchema,
  roomIdParamSchema,
  roomListQuerySchema,
} from '../schemas/rooms';
import type { RoomsService } from '../services/rooms.service';

export function createRoomsRouter(deps: { service: RoomsService; security: Security }): Router {
  const router = Router();
  const controller = createRoomsController(deps.service);
  const { security } = deps;

  router.get('/rooms/counters', ...security.protect('rooms', 'list'), controller.counters);
  router.all('/rooms/counters', methodNotAllowed(['GET', 'HEAD']));

  router.get('/rooms', ...security.protect('rooms', 'list'), validate({ query: roomListQuerySchema }), controller.list);
  router.post('/rooms', ...security.protect('rooms', 'create'), validate({ body: roomBodySchema }), controller.create);
  router.all('/rooms', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/rooms/:id', ...security.protect('rooms', 'read'), validate({ params: roomIdParamSchema }), controller.get);
  router.put(
    '/rooms/:id',
    ...security.protect('rooms', 'update'),
    validate({ params: roomIdParamSchema, body: roomBodySchema }),
    controller.update,
  );
  router.delete(
    '/rooms/:id',
    ...security.protect('rooms', 'delete'),
    validate({ params: roomIdParamSchema }),
    controller.remove,
  );
  router.all('/rooms/:id', methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.post(
    '/rooms/:id/assignments',
    ...security.protect('occupancy', 'create'),
    validate({ params: roomIdParamSchema, body: assignmentBodySchema }),
    controller.assign,
  );
  router.all('/rooms/:id/assignments', methodNotAllowed(['POST']));

  router.post(
    '/rooms/:id/releases',
    ...security.protect('occupancy', 'update'),
    validate({ params: roomIdParamSchema, body: releaseBodySchema }),
    controller.release,
  );
  router.all('/rooms/:id/releases', methodNotAllowed(['POST']));

  router.get(
    '/occupancy-history/summary',
    ...security.protect('occupancy', 'list'),
    validate({ query: occupancySummaryQuerySchema }),
    controller.summary,
  );
  router.all('/occupancy-history/summary', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/occupancy-history',
    ...security.protect('occupancy', 'list'),
    validate({ query: occupancyListQuerySchema }),
    controller.history,
  );
  router.all('/occupancy-history', methodNotAllowed(['GET', 'HEAD']));

  return router;
}
