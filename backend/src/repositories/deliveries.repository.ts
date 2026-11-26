// Acceso a datos de Entregas_de_Proveedor (Req. 24).

import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

export const DELIVERY_SELECT = {
  id: true,
  supplierId: true,
  supplier: { select: { id: true, name: true } },
  productId: true,
  product: { select: { id: true, name: true, category: true } },
  quantityRequested: true,
  scheduledDate: true,
  status: true,
  receivedDate: true,
  quantityReceived: true,
} as const;

export async function listDeliveries(db: Client) {
  return db.supplierDelivery.findMany({
    select: DELIVERY_SELECT,
    orderBy: [{ scheduledDate: 'desc' }, { id: 'desc' }],
  });
}

export async function findDeliveryById(db: Client, id: number) {
  return db.supplierDelivery.findUnique({ where: { id }, select: DELIVERY_SELECT });
}

export async function findProductForDelivery(db: Client, id: number) {
  return db.product.findUnique({ where: { id }, select: { id: true, name: true, category: true, supplierId: true, quantity: true } });
}

export interface DeliveryWriteData {
  supplierId: number;
  productId: number;
  quantityRequested: number;
  scheduledDate: Date;
}

export async function createDelivery(tx: DbClient, data: DeliveryWriteData) {
  return runWithDbErrors({ operation: 'create', referenceField: 'productId' }, () =>
    tx.supplierDelivery.create({ data: { ...data, status: 'programada' }, select: DELIVERY_SELECT }),
  );
}

export async function updateDelivery(tx: DbClient, id: number, data: DeliveryWriteData) {
  return runWithDbErrors({ operation: 'update', referenceField: 'productId' }, () =>
    tx.supplierDelivery.update({ where: { id }, data, select: DELIVERY_SELECT }),
  );
}

export async function markDeliveryReceived(
  tx: DbClient,
  id: number,
  data: { receivedDate: Date; quantityReceived: number },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.supplierDelivery.update({ where: { id }, data: { ...data, status: 'recibida' }, select: DELIVERY_SELECT }),
  );
}

export async function markDeliveryCancelled(tx: DbClient, id: number) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.supplierDelivery.update({ where: { id }, data: { status: 'cancelada' }, select: DELIVERY_SELECT }),
  );
}

export async function setProductQuantity(tx: DbClient, id: number, quantity: number) {
  return runWithDbErrors({ operation: 'update' }, () => tx.product.update({ where: { id }, data: { quantity } }));
}

export async function createDeliveryMovement(
  tx: DbClient,
  data: { productId: number; quantityBefore: number; quantityAfter: number; reason: string; userId: number; deliveryId: number },
) {
  // Cualquier fallo del Movimiento debe llegar como 500 y revertir la recepción
  // completa; no se convierte en un 400 de referencia inválida (Req. 24.3 y 25.7).
  return tx.inventoryMovement.create({
    data: { ...data, type: 'entrada' },
    select: {
      id: true,
      productId: true,
      type: true,
      quantityBefore: true,
      quantityAfter: true,
      reason: true,
      userId: true,
      deliveryId: true,
      createdAt: true,
    },
  });
}
