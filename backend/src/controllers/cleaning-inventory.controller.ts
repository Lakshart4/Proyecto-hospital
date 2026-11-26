// Controlador propio del Módulo_Inventario_Limpieza (Req. 23).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  MovementBody,
  ProductBody,
  ProductListQuery,
  ProductMovementsQuery,
} from '../schemas/cleaning-inventory';
import type { CleaningInventoryService } from '../services/cleaning-inventory.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createCleaningInventoryController(service: CleaningInventoryService) {
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

  return { list, get, create, update, remove, move, productMovements };
}
