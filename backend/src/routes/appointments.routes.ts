import { Router } from 'express';
import { createAppointmentsController } from '../controllers/appointments.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import { appointmentBodySchema, appointmentIdParamSchema, appointmentListQuerySchema, cancelAppointmentBodySchema } from '../schemas/appointments';
import type { AppointmentsService } from '../services/appointments.service';

export function createAppointmentsRouter(deps: { service: AppointmentsService; security: Security }): Router {
  const router = Router();
  const controller = createAppointmentsController(deps.service);
  const { security } = deps;

  router.get('/appointments', ...security.protect('appointments', 'list'), validate({ query: appointmentListQuerySchema }), controller.list);
  router.post('/appointments', ...security.protect('appointments', 'create'), validate({ body: appointmentBodySchema }), controller.create);
  router.all('/appointments', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/appointments/:id', ...security.protect('appointments', 'read'), validate({ params: appointmentIdParamSchema }), controller.get);
  router.put('/appointments/:id', ...security.protect('appointments', 'update'), validate({ params: appointmentIdParamSchema, body: appointmentBodySchema }), controller.update);
  router.all('/appointments/:id', methodNotAllowed(['GET', 'HEAD', 'PUT']));

  router.patch('/appointments/:id/cancel', ...security.protect('appointments', 'update'), validate({ params: appointmentIdParamSchema, body: cancelAppointmentBodySchema }), controller.cancel);
  router.all('/appointments/:id/cancel', methodNotAllowed(['PATCH']));
  return router;
}
