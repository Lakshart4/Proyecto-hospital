// Controlador de Equipos_Médicos y Registros_de_Mantenimiento (Req. 8, 26).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  CloseMaintenanceBody,
  EquipmentBody,
  EquipmentListQuery,
  EquipmentStatusBody,
  MaintenanceBody,
  MaintenanceListQuery,
} from '../schemas/equipment';
import type { EquipmentService } from '../services/equipment.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createEquipmentController(service: EquipmentService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(req.query as unknown as EquipmentListQuery));
  };

  const summary: RequestHandler = async (_req, res) => {
    res.status(200).json(await service.summary());
  };

  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.get(idOf(req)) });
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.create(req.body as EquipmentBody) });
  };

  const update: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.update(idOf(req), req.body as EquipmentBody) });
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(idOf(req));
    res.status(204).end();
  };

  const changeStatus: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.changeStatus(actorOf(req), idOf(req), req.body as EquipmentStatusBody) });
  };

  const listMaintenance: RequestHandler = async (req, res) => {
    res.status(200).json(await service.listMaintenance(req.query as unknown as MaintenanceListQuery));
  };

  const open: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.open(actorOf(req), req.body as MaintenanceBody) });
  };

  const close: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.close(actorOf(req), idOf(req), req.body as CloseMaintenanceBody) });
  };

  const equipmentMaintenance: RequestHandler = async (req, res) => {
    res.status(200).json(await service.equipmentMaintenance(idOf(req)));
  };

  return { list, summary, get, create, update, remove, changeStatus, listMaintenance, open, close, equipmentMaintenance };
}
