// Controlador de Proveedores y Entregas_de_Proveedor (Req. 7.12, 24).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  DeliveryBody,
  DeliveryListQuery,
  ReceiveDeliveryBody,
  SupplierBody,
} from '../schemas/suppliers';
import type { SuppliersService } from '../services/suppliers.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createSuppliersController(service: SuppliersService) {
  const listSuppliers: RequestHandler = async (req, res) => {
    res.status(200).json(await service.listSuppliers(req.query as unknown as { search?: string }));
  };

  const getSupplier: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.getSupplier(idOf(req)) });
  };

  const createSupplier: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.createSupplier(req.body as SupplierBody) });
  };

  const updateSupplier: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.updateSupplier(idOf(req), req.body as SupplierBody) });
  };

  const removeSupplier: RequestHandler = async (req, res) => {
    await service.removeSupplier(idOf(req));
    res.status(204).end();
  };

  const listDeliveries: RequestHandler = async (req, res) => {
    res.status(200).json(await service.listDeliveries(req.query as unknown as DeliveryListQuery));
  };

  const getDelivery: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.getDelivery(idOf(req)) });
  };

  const createDelivery: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.createDelivery(req.body as DeliveryBody) });
  };

  const updateDelivery: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.updateDelivery(idOf(req), req.body as DeliveryBody) });
  };

  const receive: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.receive(actorOf(req), idOf(req), req.body as ReceiveDeliveryBody) });
  };

  const cancel: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.cancel(actorOf(req), idOf(req)) });
  };

  return {
    listSuppliers,
    getSupplier,
    createSupplier,
    updateSupplier,
    removeSupplier,
    listDeliveries,
    getDelivery,
    createDelivery,
    updateDelivery,
    receive,
    cancel,
  };
}
