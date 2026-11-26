// Controlador de Calendarios, Eventos, Días_Inhábiles y Feriados (Req. 10, 11, 28).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  AgendaQuery,
  BirthdaysQuery,
  CalendarRangeQuery,
  EventBody,
  HolidaysQuery,
  NonWorkingDayBody,
  PersonalEventBody,
} from '../schemas/calendars';
import type { CalendarsService } from '../services/calendars.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createCalendarsController(service: CalendarsService) {
  const general: RequestHandler = async (req, res) => {
    res.status(200).json(await service.general(req.query as unknown as CalendarRangeQuery));
  };

  const activities: RequestHandler = async (req, res) => {
    res.status(200).json(await service.activities(req.query as unknown as CalendarRangeQuery));
  };

  const birthdays: RequestHandler = async (req, res) => {
    res.status(200).json(await service.birthdays(req.query as unknown as BirthdaysQuery));
  };

  const shifts: RequestHandler = async (req, res) => {
    res.status(200).json(await service.shifts(actorOf(req), req.query as unknown as CalendarRangeQuery));
  };

  const agenda: RequestHandler = async (req, res) => {
    res.status(200).json(await service.agenda(actorOf(req), req.query as unknown as AgendaQuery));
  };

  const createEvent: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.createEvent(actorOf(req), req.body as EventBody) });
  };

  const updateEvent: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.updateEvent(actorOf(req), idOf(req), req.body as EventBody) });
  };

  const removeEvent: RequestHandler = async (req, res) => {
    await service.removeEvent(actorOf(req), idOf(req));
    res.status(204).end();
  };

  const createPersonal: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.createPersonal(actorOf(req), req.body as PersonalEventBody) });
  };

  const updatePersonal: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.updatePersonal(actorOf(req), idOf(req), req.body as PersonalEventBody) });
  };

  const removePersonal: RequestHandler = async (req, res) => {
    await service.removePersonal(actorOf(req), idOf(req));
    res.status(204).end();
  };

  const listNonWorkingDays: RequestHandler = async (_req, res) => {
    res.status(200).json(await service.listNonWorkingDays());
  };

  const createNonWorkingDay: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.createNonWorkingDay(actorOf(req), req.body as NonWorkingDayBody) });
  };

  const updateNonWorkingDay: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.updateNonWorkingDay(actorOf(req), idOf(req), req.body as NonWorkingDayBody) });
  };

  const removeNonWorkingDay: RequestHandler = async (req, res) => {
    await service.removeNonWorkingDay(actorOf(req), idOf(req));
    res.status(204).end();
  };

  const holidays: RequestHandler = async (req, res) => {
    res.status(200).json(await service.holidays(req.query as unknown as HolidaysQuery));
  };

  return {
    general,
    activities,
    birthdays,
    shifts,
    agenda,
    createEvent,
    updateEvent,
    removeEvent,
    createPersonal,
    updatePersonal,
    removePersonal,
    listNonWorkingDays,
    createNonWorkingDay,
    updateNonWorkingDay,
    removeNonWorkingDay,
    holidays,
  };
}
