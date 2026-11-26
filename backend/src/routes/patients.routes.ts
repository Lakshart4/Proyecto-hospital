// Rutas de Pacientes, movimientos y Tratamientos_Programados (Req. 6, 20, 21).

import { Router } from 'express';
import { createPatientsController } from '../controllers/patients.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  observationBodySchema,
  patientBodySchema,
  patientIdParamSchema,
  patientListQuerySchema,
  patientStatusBodySchema,
  readmissionBodySchema,
  treatmentBodySchema,
  treatmentListQuerySchema,
  treatmentParamsSchema,
  treatmentStatusBodySchema,
} from '../schemas/patients';
import type { PatientsService } from '../services/patients.service';
import { createRoomsRouter } from './rooms.routes';

export function createPatientsRouter(deps: { service: PatientsService; security: Security }): Router {
  const router = Router();
  const controller = createPatientsController(deps.service);
  const { security } = deps;

  router.get('/patients/counts', ...security.protect('patients', 'list'), controller.counts);
  router.all('/patients/counts', methodNotAllowed(['GET', 'HEAD']));

  router.get('/patients', ...security.protect('patients', 'list'), validate({ query: patientListQuerySchema }), controller.list);
  router.post('/patients', ...security.protect('patients', 'create'), validate({ body: patientBodySchema }), controller.create);
  router.all('/patients', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/patients/:id', ...security.protect('patients', 'read'), validate({ params: patientIdParamSchema }), controller.get);
  router.put(
    '/patients/:id',
    ...security.protect('patients', 'update'),
    validate({ params: patientIdParamSchema, body: patientBodySchema }),
    controller.update,
  );
  router.delete('/patients/:id', ...security.protect('patients', 'delete'), validate({ params: patientIdParamSchema }), controller.remove);
  router.all('/patients/:id', methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.patch(
    '/patients/:id/status',
    ...security.protect('patients', 'update'),
    validate({ params: patientIdParamSchema, body: patientStatusBodySchema }),
    controller.changeStatus,
  );
  router.all('/patients/:id/status', methodNotAllowed(['PATCH']));

  router.post(
    '/patients/:id/readmission',
    ...security.protect('patients', 'update'),
    validate({ params: patientIdParamSchema, body: readmissionBodySchema }),
    controller.readmit,
  );
  router.all('/patients/:id/readmission', methodNotAllowed(['POST']));

  router.patch(
    '/patients/:id/medical-observation',
    ...security.protect('patientObservations', 'update'),
    validate({ params: patientIdParamSchema, body: observationBodySchema }),
    controller.setMedicalObservation,
  );
  router.all('/patients/:id/medical-observation', methodNotAllowed(['PATCH']));

  router.patch(
    '/patients/:id/nursing-observation',
    ...security.protect('patientObservations', 'update'),
    validate({ params: patientIdParamSchema, body: observationBodySchema }),
    controller.setNursingObservation,
  );
  router.all('/patients/:id/nursing-observation', methodNotAllowed(['PATCH']));

  router.get(
    '/patients/:id/movements',
    ...security.protect('patientMovements', 'list'),
    validate({ params: patientIdParamSchema }),
    controller.movements,
  );
  router.all('/patients/:id/movements', methodNotAllowed(['GET', 'HEAD']));
  router.all('/patients/:id/movements/:mid', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/patients/:id/treatments',
    ...security.protect('patientTreatments', 'list'),
    validate({ params: patientIdParamSchema, query: treatmentListQuerySchema }),
    controller.listTreatments,
  );
  router.post(
    '/patients/:id/treatments',
    ...security.protect('patientTreatments', 'create'),
    validate({ params: patientIdParamSchema, body: treatmentBodySchema }),
    controller.createTreatment,
  );
  router.all('/patients/:id/treatments', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.put(
    '/patients/:id/treatments/:tid',
    ...security.protect('patientTreatments', 'update'),
    validate({ params: treatmentParamsSchema, body: treatmentBodySchema }),
    controller.updateTreatment,
  );
  router.all('/patients/:id/treatments/:tid', methodNotAllowed(['PUT']));

  router.patch(
    '/patients/:id/treatments/:tid/status',
    ...security.protect('patientTreatments', 'update'),
    validate({ params: treatmentParamsSchema, body: treatmentStatusBodySchema }),
    controller.changeTreatmentStatus,
  );
  router.all('/patients/:id/treatments/:tid/status', methodNotAllowed(['PATCH']));

  // Habitaciones comparte el montaje clínico ya disponible en la aplicación; ambos routers usan la
  // misma instancia de seguridad y el mismo cliente transaccional inyectado en el servicio.
  router.use(createRoomsRouter({ service: deps.service.rooms, security }));

  return router;
}
