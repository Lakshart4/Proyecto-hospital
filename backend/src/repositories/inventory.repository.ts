// Acceso a datos del Inventario médico y de limpieza, y de los Movimientos_de_Inventario
// (Req. 7, 22, 23, 25).

import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

const MEDICATION_SELECT = {
  type: true,
  activeIngredient: true,
  tradeName: true,
  controlClass: true,
  requiresPrescription: true,
} as const;

export const PRODUCT_SELECT = {
  id: true,
  name: true,
  category: true,
  classification: true,
  quantity: true,
  minStock: true,
  supplierId: true,
  supplier: { select: { id: true, name: true } },
  medicationInfo: { select: MEDICATION_SELECT },
  createdAt: true,
  updatedAt: true,
} as const;

export const MOVEMENT_SELECT = {
  id: true,
  productId: true,
  type: true,
  quantityBefore: true,
  quantityAfter: true,
  reason: true,
  userId: true,
  user: { select: { id: true, name: true, role: true } },
  deliveryId: true,
  createdAt: true,
  product: { select: { id: true, name: true, category: true } },
} as const;

export async function listProducts(db: Client) {
  return db.product.findMany({
    select: PRODUCT_SELECT,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export async function findProductById(db: Client, id: number) {
  return db.product.findUnique({ where: { id }, select: PRODUCT_SELECT });
}

export interface MedicationWriteData {
  type: string;
  activeIngredient: string;
  tradeName: string | null;
  controlClass: string;
  requiresPrescription: boolean;
}

export interface ProductWriteData {
  name: string;
  category: string;
  classification: string;
  quantity: number;
  minStock: number;
  supplierId: number;
}

export async function createProduct(tx: DbClient, data: ProductWriteData, medication: MedicationWriteData | null) {
  return runWithDbErrors({ operation: 'create', referenceField: 'supplierId' }, () =>
    tx.product.create({
      data: { ...data, ...(medication ? { medicationInfo: { create: medication } } : {}) },
      select: PRODUCT_SELECT,
    }),
  );
}

export async function updateProduct(
  tx: DbClient,
  id: number,
  data: ProductWriteData,
  medication: MedicationWriteData | null,
) {
  return runWithDbErrors({ operation: 'update', referenceField: 'supplierId' }, async () => {
    if (medication) {
      await tx.medicationInfo.upsert({
        where: { productId: id },
        create: { productId: id, ...medication },
        update: medication,
      });
    } else {
      await tx.medicationInfo.deleteMany({ where: { productId: id } });
    }
    return tx.product.update({ where: { id }, data, select: PRODUCT_SELECT });
  });
}

export async function setProductQuantity(tx: DbClient, id: number, quantity: number) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.product.update({ where: { id }, data: { quantity }, select: PRODUCT_SELECT }),
  );
}

export async function deleteProduct(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.product.delete({ where: { id } }));
}

export async function createMovement(
  tx: DbClient,
  data: {
    productId: number;
    type: string;
    quantityBefore: number;
    quantityAfter: number;
    reason: string;
    userId: number;
    deliveryId?: number | null;
  },
) {
  // Un fallo al insertar el Movimiento debe propagarse como error interno para que
  // Prisma revierta también la cantidad (Req. 25.7). No se traduce como una
  // referencia inválida del Producto: Producto y Usuario ya fueron verificados.
  return tx.inventoryMovement.create({ data, select: MOVEMENT_SELECT });
}

export async function listMovements(db: Client) {
  return db.inventoryMovement.findMany({
    select: MOVEMENT_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export async function listProductMovements(db: Client, productId: number) {
  return db.inventoryMovement.findMany({
    where: { productId },
    select: MOVEMENT_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}
