// Rutas de Calendarios, Eventos, Días_Inhábiles y Feriados (Req. 10, 11, 28).
//
// La matriz concede `events` a los Empleados para que puedan gestionar su agenda. Por eso las rutas de
// Eventos generales y de Días_Inhábiles comprueban explícitamente el rol ADMIN además de `protect`.

import { Router, type RequestHandler } from 'express';
import { createCalendarsController } from '../controllers/calendars.controller';
import { ForbiddenError, UnauthenticatedError } from '../lib/errors';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import {
  agendaQuerySchema,
  birthdaysQuerySchema,
  calendarRangeQuerySchema,
  eventBodySchema,
  eventIdParamSchema,
  holidaysQuerySchema,
  nonWorkingDayBodySchema,
  nonWorkingDayIdParamSchema,
  personalEventBodySchema,
} from '../schemas/calendars';
import type { CalendarsService } from '../services/calendars.service';

const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new UnauthenticatedError());
  next(req.auth.user.role === 'ADMIN' ? undefined : new ForbiddenError());
};

export function createCalendarsRouter(deps: { service: CalendarsService; security: Security }): Router {
  const router = Router();
  const controller = createCalendarsController(deps.service);
  const { security } = deps;
  const session = [security.authenticate, security.requirePasswordChange];

  router.get(
    '/calendars/general',
    ...session,
    validate({ query: calendarRangeQuerySchema }),
    controller.general,
  );
  router.all('/calendars/general', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/calendars/activities',
    ...session,
    validate({ query: calendarRangeQuerySchema }),
    controller.activities,
  );
  router.all('/calendars/activities', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/calendars/birthdays',
    ...session,
    validate({ query: birthdaysQuerySchema }),
    controller.birthdays,
  );
  router.all('/calendars/birthdays', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/calendars/shifts',
    ...security.protect('shifts', 'read'),
    validate({ query: calendarRangeQuerySchema }),
    controller.shifts,
  );
  router.all('/calendars/shifts', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/calendars/agenda',
    ...security.protect('events', 'read'),
    validate({ query: agendaQuerySchema }),
    controller.agenda,
  );
  router.all('/calendars/agenda', methodNotAllowed(['GET', 'HEAD']));

  // `/events/personal` debe registrarse antes de `/events/:id`.
  router.post(
    '/events/personal',
    ...security.protect('events', 'create'),
    validate({ body: personalEventBodySchema }),
    controller.createPersonal,
  );
  router.all('/events/personal', methodNotAllowed(['POST']));

  router.put(
    '/events/personal/:id',
    ...security.protect('events', 'update'),
    validate({ params: eventIdParamSchema, body: personalEventBodySchema }),
    controller.updatePersonal,
  );
  router.delete(
    '/events/personal/:id',
    ...security.protect('events', 'delete'),
    validate({ params: eventIdParamSchema }),
    controller.removePersonal,
  );
  router.all('/events/personal/:id', methodNotAllowed(['PUT', 'DELETE']));

  router.post(
    '/events',
    ...security.protect('events', 'create'),
    requireAdmin,
    validate({ body: eventBodySchema }),
    controller.createEvent,
  );
  router.all('/events', methodNotAllowed(['POST']));

  router.put(
    '/events/:id',
    ...security.protect('events', 'update'),
    requireAdmin,
    validate({ params: eventIdParamSchema, body: eventBodySchema }),
    controller.updateEvent,
  );
  router.delete(
    '/events/:id',
    ...security.protect('events', 'delete'),
    requireAdmin,
    validate({ params: eventIdParamSchema }),
    controller.removeEvent,
  );
  router.all('/events/:id', methodNotAllowed(['PUT', 'DELETE']));

  router.get(
    '/non-working-days',
    ...security.protect('nonWorkingDays', 'read'),
    controller.listNonWorkingDays,
  );
  router.post(
    '/non-working-days',
    ...security.protect('nonWorkingDays', 'create'),
    requireAdmin,
    validate({ body: nonWorkingDayBodySchema }),
    controller.createNonWorkingDay,
  );
  router.all('/non-working-days', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.put(
    '/non-working-days/:id',
    ...security.protect('nonWorkingDays', 'update'),
    requireAdmin,
    validate({ params: nonWorkingDayIdParamSchema, body: nonWorkingDayBodySchema }),
    controller.updateNonWorkingDay,
  );
  router.delete(
    '/non-working-days/:id',
    ...security.protect('nonWorkingDays', 'delete'),
    requireAdmin,
    validate({ params: nonWorkingDayIdParamSchema }),
    controller.removeNonWorkingDay,
  );
  router.all('/non-working-days/:id', methodNotAllowed(['PUT', 'DELETE']));

  router.get(
    '/holidays',
    ...security.protect('holidays', 'read'),
    validate({ query: holidaysQuerySchema }),
    controller.holidays,
  );
  router.all('/holidays', methodNotAllowed(['GET', 'HEAD']));

  return router;
}
