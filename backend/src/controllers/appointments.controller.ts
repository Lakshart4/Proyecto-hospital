import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type { AppointmentBody, AppointmentListQuery, CancelAppointmentBody } from '../schemas/appointments';
import type { AppointmentsService } from '../services/appointments.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}
const idOf = (req: Request) => (req.params as unknown as { id: number }).id;

export function createAppointmentsController(service: AppointmentsService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(actorOf(req), req.query as unknown as AppointmentListQuery));
  };
  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.get(actorOf(req), idOf(req)) });
  };
  const create: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.create(actorOf(req), req.body as AppointmentBody) });
  };
  const update: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.update(actorOf(req), idOf(req), req.body as AppointmentBody) });
  };
  const cancel: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.cancel(actorOf(req), idOf(req), req.body as CancelAppointmentBody) });
  };
  return { list, get, create, update, cancel };
}
