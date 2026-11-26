// Controlador de Habitaciones, Asignaciones, liberaciones e Historial_de_Ocupación (Req. 9, 27).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  OccupancyListQuery,
  OccupancySummaryQuery,
  ReleaseBody,
  RoomBody,
  RoomListQuery,
} from '../schemas/rooms';
import type { RoomsService } from '../services/rooms.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createRoomsController(service: RoomsService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(req.query as unknown as RoomListQuery));
  };

  const counters: RequestHandler = async (_req, res) => {
    res.status(200).json({ data: await service.counters() });
  };

  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.get(idOf(req)) });
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.create(req.body as RoomBody) });
  };

  const update: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.update(idOf(req), req.body as RoomBody) });
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(idOf(req));
    res.status(204).end();
  };

  const assign: RequestHandler = async (req, res) => {
    const body = req.body as { patientId: number };
    res.status(201).json({ data: await service.assign(actorOf(req), idOf(req), body.patientId) });
  };

  const release: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.release(actorOf(req), idOf(req), req.body as ReleaseBody) });
  };

  const history: RequestHandler = async (req, res) => {
    res.status(200).json(await service.history(req.query as unknown as OccupancyListQuery));
  };

  const summary: RequestHandler = async (req, res) => {
    res.status(200).json(await service.summary(req.query as unknown as OccupancySummaryQuery));
  };

  return { list, counters, get, create, update, remove, assign, release, history, summary };
}
