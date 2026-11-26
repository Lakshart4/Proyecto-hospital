// Acceso a datos de Proveedores (Req. 7.12, 24.8).

import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

export const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contact: true,
  _count: { select: { products: true, deliveries: true } },
} as const;

export const SUPPLIER_DETAIL_SELECT = {
  id: true,
  name: true,
  contact: true,
  products: {
    select: {
      id: true,
      name: true,
      category: true,
      classification: true,
      quantity: true,
      minStock: true,
    },
    orderBy: { name: 'asc' as const },
  },
  deliveries: {
    select: {
      id: true,
      quantityRequested: true,
      scheduledDate: true,
      status: true,
      receivedDate: true,
      quantityReceived: true,
      product: { select: { id: true, name: true, category: true } },
    },
    orderBy: [{ scheduledDate: 'desc' as const }, { id: 'desc' as const }],
  },
};

export async function listSuppliers(db: Client) {
  return db.supplier.findMany({ select: SUPPLIER_SELECT, orderBy: { name: 'asc' } });
}

export async function findSupplierById(db: Client, id: number) {
  return db.supplier.findUnique({ where: { id }, select: SUPPLIER_DETAIL_SELECT });
}

export async function createSupplier(tx: DbClient, data: { name: string; contact: string }) {
  return runWithDbErrors({ operation: 'create' }, () => tx.supplier.create({ data, select: SUPPLIER_SELECT }));
}

export async function updateSupplier(tx: DbClient, id: number, data: { name: string; contact: string }) {
  return runWithDbErrors({ operation: 'update' }, () => tx.supplier.update({ where: { id }, data, select: SUPPLIER_SELECT }));
}

export async function deleteSupplier(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.supplier.delete({ where: { id } }));
}
