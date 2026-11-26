// Servicio de Proveedores y Entregas_de_Proveedor (Req. 7.12, 24).
//
// Recibir una entrega suma la cantidad al Producto, deja la entrega "recibida", registra el
// Movimiento_de_Inventario y la auditoría en una sola transacción. Cancelar no toca la cantidad.

import { canEditDelivery, receiveDelivery, transitionDelivery, validateDeliveryData, type DeliveryLike } from '../domain/deliveries';
import { applyFilters, dateRange, equals, search } from '../domain/filters';
import { parsePagination, toPage } from '../domain/others';
import { availabilityOf, isLowStock } from '../domain/stock';
import type { DeliveryStatus } from '../domain/constants';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  createDelivery,
  createDeliveryMovement,
  findDeliveryById,
  findProductForDelivery,
  listDeliveries,
  markDeliveryCancelled,
  markDeliveryReceived,
  setProductQuantity,
  updateDelivery,
} from '../repositories/deliveries.repository';
import {
  createSupplier,
  deleteSupplier,
  findSupplierById,
  listSuppliers,
  updateSupplier,
} from '../repositories/suppliers.repository';
import { withTransaction } from '../repositories/transaction';
import type {
  DeliveryBody,
  DeliveryListQuery,
  ReceiveDeliveryBody,
  SupplierBody,
} from '../schemas/suppliers';
import type { Actor } from './staff.service';

export const SUPPLIER_MESSAGES = {
  notFound: 'El proveedor no existe.',
  deliveryNotFound: 'La entrega no existe.',
  productNotFound: 'El producto no existe.',
  deliveryNotEditable: 'Solo se puede editar una entrega programada.',
  deliveryNotReceivable: 'Solo se puede recibir una entrega programada.',
  deliveryNotCancellable: 'Solo se puede cancelar una entrega programada.',
  overflow: 'La cantidad del producto superaría el máximo permitido (999999).',
  invalidReceivedQuantity: 'La cantidad recibida debe ser un número entero entre 1 y 999999.',
  receivedInFuture: 'La fecha de recepción no puede ser posterior a hoy.',
} as const;

export interface SuppliersServiceOptions {
  db: Database;
  now?: () => Date;
}

export function createSuppliersService(options: SuppliersServiceOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  const requireSupplier = async (id: number) => {
    const supplier = await findSupplierById(db, id);
    if (supplier === null) throw new NotFoundError(SUPPLIER_MESSAGES.notFound);
    return supplier;
  };

  const requireDelivery = async (id: number) => {
    const delivery = await findDeliveryById(db, id);
    if (delivery === null) throw new NotFoundError(SUPPLIER_MESSAGES.deliveryNotFound);
    return delivery;
  };

  const requireDeliveryProduct = async (productId: number) => {
    const product = await findProductForDelivery(db, productId);
    if (product === null) throw new NotFoundError(SUPPLIER_MESSAGES.productNotFound);
    return product;
  };

  const validateDelivery = async (body: DeliveryBody) => {
    // En creación y edición una referencia inexistente es un dato inválido (400),
    // no un detalle ausente (404), conforme al Req. 24.2.
    const product = await findProductForDelivery(db, body.productId);
    if (product === null) {
      throw new ValidationError('Los datos enviados no son válidos.', [
        { field: 'productId', message: SUPPLIER_MESSAGES.productNotFound },
      ]);
    }
    const errors = validateDeliveryData(body, product);
    if (errors.length > 0) throw new ValidationError('Los datos enviados no son válidos.', errors);
    return product;
  };

  return {
    async listSuppliers(query: { search?: string }) {
      const rows = await listSuppliers(db);
      const filtered = applyFilters(rows, [search((s) => [s.name, s.contact], query.search)]);
      return { data: filtered };
    },

    async getSupplier(id: number) {
      const supplier = await requireSupplier(id);
      return {
        ...supplier,
        products: supplier.products.map((product) => ({
          ...product,
          lowStock: isLowStock(product.quantity, product.minStock),
          availability: availabilityOf(product.quantity),
        })),
      };
    },

    async createSupplier(body: SupplierBody) {
      return createSupplier(db, body);
    },

    async updateSupplier(id: number, body: SupplierBody) {
      await requireSupplier(id);
      return updateSupplier(db, id, body);
    },

    async removeSupplier(id: number) {
      await requireSupplier(id);
      await deleteSupplier(db, id);
    },

    async listDeliveries(query: DeliveryListQuery) {
      const pagination = parsePagination(query as Record<string, unknown>);
      const rows = await listDeliveries(db);
      const filtered = applyFilters(rows, [
        equals((d) => d.supplierId, query.supplierId),
        equals((d) => d.productId, query.productId),
        equals((d) => d.status, query.status),
        dateRange((d) => d.scheduledDate, { from: query.from, to: query.to }),
      ]);
      return toPage(filtered.slice(pagination.skip, pagination.skip + pagination.take), filtered.length, pagination);
    },

    async getDelivery(id: number) {
      return requireDelivery(id);
    },

    async createDelivery(body: DeliveryBody) {
      await validateDelivery(body);
      return createDelivery(db, body);
    },

    async updateDelivery(id: number, body: DeliveryBody) {
      const existing = await requireDelivery(id);
      if (!canEditDelivery(existing.status as DeliveryStatus)) {
        throw new ConflictError(SUPPLIER_MESSAGES.deliveryNotEditable);
      }
      await validateDelivery(body);
      return updateDelivery(db, id, body);
    },

    async receive(actor: Actor, id: number, body: ReceiveDeliveryBody) {
      const delivery = await requireDelivery(id);
      const product = await requireDeliveryProduct(delivery.productId);
      const like: DeliveryLike = {
        status: delivery.status as DeliveryStatus,
        supplierId: delivery.supplierId,
        productId: delivery.productId,
        quantityRequested: delivery.quantityRequested,
      };
      const result = receiveDelivery(like, product.quantity, body.quantityReceived, body.receivedDate, now());
      if (!result.ok) {
        if (result.error.code === 'CONFLICT') throw new ConflictError(SUPPLIER_MESSAGES.deliveryNotReceivable);
        if (result.error.code === 'OVERFLOW') throw new ConflictError(SUPPLIER_MESSAGES.overflow);
        const message =
          result.error.field === 'receivedDate' ? SUPPLIER_MESSAGES.receivedInFuture : SUPPLIER_MESSAGES.invalidReceivedQuantity;
        throw new ValidationError('Los datos enviados no son válidos.', [{ field: result.error.field, message }]);
      }

      return withTransaction(
        async (tx) => {
          await setProductQuantity(tx, delivery.productId, result.after);
          const updated = await markDeliveryReceived(tx, id, {
            receivedDate: result.receivedDate,
            quantityReceived: result.quantityReceived,
          });
          await createDeliveryMovement(tx, {
            productId: delivery.productId,
            quantityBefore: result.before,
            quantityAfter: result.after,
            reason: `Recepción de entrega #${id}`,
            userId: actor.id,
            deliveryId: id,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'DELIVERY_RECEIVE',
            entityType: 'SupplierDelivery',
            entityId: id,
            details: { productId: delivery.productId, quantityReceived: result.quantityReceived },
          });
          return updated;
        },
        { client: db },
      );
    },

    async cancel(actor: Actor, id: number) {
      const delivery = await requireDelivery(id);
      if (!transitionDelivery(delivery.status as DeliveryStatus, 'cancelada')) {
        throw new ConflictError(SUPPLIER_MESSAGES.deliveryNotCancellable);
      }
      return withTransaction(
        async (tx) => {
          const updated = await markDeliveryCancelled(tx, id);
          await writeAudit(tx, {
            userId: actor.id,
            action: 'DELIVERY_CANCEL',
            entityType: 'SupplierDelivery',
            entityId: id,
            details: { productId: delivery.productId },
          });
          return updated;
        },
        { client: db },
      );
    },
  };
}

export type SuppliersService = ReturnType<typeof createSuppliersService>;
