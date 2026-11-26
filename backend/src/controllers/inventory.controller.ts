// Controlador del Inventario médico y del Inventario de limpieza (Req. 7, 22, 23, 25).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  MovementBody,
  MovementListQuery,
  ProductBody,
  ProductListQuery,
  ProductMovementsQuery,
} from '../schemas/inventory';
import type { InventoryService } from '../services/inventory.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createInventoryController(service: InventoryService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(actorOf(req), req.query as unknown as ProductListQuery));
  };

  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.get(idOf(req)) });
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.create(actorOf(req), req.body as ProductBody) });
  };

  const update: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.update(actorOf(req), idOf(req), req.body as ProductBody) });
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(idOf(req));
    res.status(204).end();
  };

  const move: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.move(actorOf(req), idOf(req), req.body as MovementBody) });
  };

  const productMovements: RequestHandler = async (req, res) => {
    res.status(200).json(await service.productMovements(idOf(req), req.query as unknown as ProductMovementsQuery));
  };

  const movements: RequestHandler = async (req, res) => {
    res.status(200).json(await service.movements(req.query as unknown as MovementListQuery));
  };

  return { list, get, create, update, remove, move, productMovements, movements };
}
