// Servicio del Inventario médico y del Inventario de limpieza (Req. 7, 22, 23, 25).
//
// Ambos inventarios comparten estas reglas; el área (`medical` o `cleaning`) restringe las categorías y
// los roles. Toda variación de cantidad registra su Movimiento_de_Inventario y su entrada de auditoría
// en la misma transacción. `lowStock`, `availability` y `controlled` se calculan, no se guardan.

import {
  CONTROL_CLASSES,
  MEDICATION_TYPES,
  SUPPLY_SUBCATEGORIES,
  type Role,
} from '../domain/constants';
import { applyFilters, dateRange, equals, movementCriteria, productCriteria } from '../domain/filters';
import { parsePagination, toPage } from '../domain/others';
import { INVENTORY_AREA_CATEGORIES, applyMovement, availabilityOf, inventoryScope, isLowStock } from '../domain/stock';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, type FieldError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  createMovement,
  createProduct,
  deleteProduct,
  findProductById,
  listMovements,
  listProductMovements,
  listProducts,
  setProductQuantity,
  updateProduct,
  type MedicationWriteData,
  type ProductWriteData,
} from '../repositories/inventory.repository';
import { withTransaction } from '../repositories/transaction';
import type {
  MedicationInfoBody,
  MovementBody,
  MovementListQuery,
  ProductBody,
  ProductListQuery,
  ProductMovementsQuery,
} from '../schemas/inventory';
import type { Actor } from './staff.service';

export const INVENTORY_MESSAGES = {
  notFound: 'El producto no existe.',
  categoryMedical: 'La categoría debe ser insumo médico o medicamento.',
  categoryCleaning: 'La categoría debe ser material de limpieza.',
  subcategory: 'La subcategoría debe ser jeringa, sonda, catéter, suero, instrumental o material médico.',
  medicationRequired: 'Los datos del medicamento son obligatorios para la categoría medicamento.',
  medicationNotAllowed: 'Solo un medicamento puede incluir datos de medicamento.',
  classificationType: 'La clasificación de un medicamento debe coincidir con su tipo.',
  tradeNameRequired: 'El nombre comercial es obligatorio para un medicamento de patente.',
  prescriptionRequired: 'La receta requerida no es coherente con la clasificación de control.',
  insufficient: 'La cantidad solicitada supera la existencia del producto.',
  overflow: 'La cantidad resultante supera el máximo permitido (999999).',
  invalidQuantity: 'La cantidad del movimiento no es válida para su tipo.',
  invalidMovementType: 'El tipo de movimiento no es válido.',
} as const;

export type InventoryArea = 'medical' | 'cleaning';

export interface InventoryServiceOptions {
  db: Database;
  area: InventoryArea;
}

type ProductRow = Awaited<ReturnType<typeof listProducts>>[number];

const decorate = (product: ProductRow) => ({
  ...product,
  lowStock: isLowStock(product.quantity, product.minStock),
  availability: availabilityOf(product.quantity),
  controlled: product.category === 'medicamento' && product.medicationInfo?.controlClass === 'controlado',
});

export function createInventoryService(options: InventoryServiceOptions) {
  const { db, area } = options;

  const allowedCategories = INVENTORY_AREA_CATEGORIES[area];

  const validateProduct = (body: ProductBody): { data: ProductWriteData; medication: MedicationWriteData | null } => {
    const errors: FieldError[] = [];
    if (!allowedCategories.includes(body.category)) {
      errors.push({
        field: 'category',
        message: area === 'medical' ? INVENTORY_MESSAGES.categoryMedical : INVENTORY_MESSAGES.categoryCleaning,
      });
    }

    let medication: MedicationWriteData | null = null;
    if (body.category === 'insumo médico') {
      if (!(SUPPLY_SUBCATEGORIES as readonly string[]).includes(body.classification)) {
        errors.push({ field: 'classification', message: INVENTORY_MESSAGES.subcategory });
      }
      if (body.medicationInfo !== undefined) {
        errors.push({ field: 'medicationInfo', message: INVENTORY_MESSAGES.medicationNotAllowed });
      }
    } else if (body.category === 'medicamento') {
      if (body.medicationInfo === undefined) {
        errors.push({ field: 'medicationInfo', message: INVENTORY_MESSAGES.medicationRequired });
      } else {
        const info: MedicationInfoBody = body.medicationInfo;
        if (!(MEDICATION_TYPES as readonly string[]).includes(info.type)) {
          errors.push({ field: 'medicationInfo.type', message: 'El tipo de medicamento no es válido.' });
        }
        if (!(CONTROL_CLASSES as readonly string[]).includes(info.controlClass)) {
          errors.push({ field: 'medicationInfo.controlClass', message: 'La clasificación de control no es válida.' });
        }
        if (body.classification !== info.type) {
          errors.push({ field: 'classification', message: INVENTORY_MESSAGES.classificationType });
        }
        if (info.type === 'de patente' && (info.tradeName === undefined || info.tradeName === null || info.tradeName.trim() === '')) {
          errors.push({ field: 'medicationInfo.tradeName', message: INVENTORY_MESSAGES.tradeNameRequired });
        }
        const needsPrescription = ['receta simple', 'receta retenida', 'controlado'].includes(info.controlClass);
        if ((needsPrescription && !info.requiresPrescription) || (info.controlClass === 'venta libre' && info.requiresPrescription)) {
          errors.push({ field: 'medicationInfo.requiresPrescription', message: INVENTORY_MESSAGES.prescriptionRequired });
        }
        medication = {
          type: info.type,
          activeIngredient: info.activeIngredient,
          tradeName: info.tradeName ?? null,
          controlClass: info.controlClass,
          requiresPrescription: info.requiresPrescription,
        };
      }
    } else if (body.medicationInfo !== undefined) {
      errors.push({ field: 'medicationInfo', message: INVENTORY_MESSAGES.medicationNotAllowed });
    }

    if (errors.length > 0) throw new ValidationError('Los datos enviados no son válidos.', errors);
    return {
      data: {
        name: body.name,
        category: body.category,
        classification: body.classification,
        quantity: body.quantity,
        minStock: body.minStock,
        supplierId: body.supplierId,
      },
      medication,
    };
  };

  const requireProduct = async (id: number) => {
    const product = await findProductById(db, id);
    if (product === null || !allowedCategories.includes(product.category)) {
      throw new NotFoundError(INVENTORY_MESSAGES.notFound);
    }
    return product;
  };

  const movementError = (error: 'INSUFFICIENT' | 'OVERFLOW' | 'INVALID') => {
    if (error === 'INSUFFICIENT') return new ConflictError(INVENTORY_MESSAGES.insufficient);
    if (error === 'OVERFLOW') return new ConflictError(INVENTORY_MESSAGES.overflow);
    return new ValidationError(INVENTORY_MESSAGES.invalidQuantity, [
      { field: 'quantity', message: INVENTORY_MESSAGES.invalidQuantity },
    ]);
  };

  return {
    async list(actor: Actor, query: ProductListQuery) {
      const pagination = parsePagination(query as Record<string, unknown>);
      const all = await listProducts(db);
      const scoped = inventoryScope(actor.role as Role, all, area);
      if (scoped === 'DENIED') throw new ForbiddenError();
      const filtered = applyFilters(scoped, productCriteria(query));
      const page = filtered.slice(pagination.skip, pagination.skip + pagination.take);
      return toPage(page.map(decorate), filtered.length, pagination);
    },

    async get(id: number) {
      return decorate(await requireProduct(id));
    },

    async create(actor: Actor, body: ProductBody) {
      const { data, medication } = validateProduct(body);
      return withTransaction(
        async (tx) => {
          const product = await createProduct(tx, data, medication);
          if (data.quantity > 0) {
            await createMovement(tx, {
              productId: product.id,
              type: 'entrada',
              quantityBefore: 0,
              quantityAfter: data.quantity,
              reason: 'Cantidad inicial',
              userId: actor.id,
            });
            await writeAudit(tx, {
              userId: actor.id,
              action: 'INVENTORY_MOVEMENT',
              entityType: 'Product',
              entityId: product.id,
              details: { type: 'entrada', quantityBefore: 0, quantityAfter: data.quantity },
            });
          }
          return decorate(product);
        },
        { client: db },
      );
    },

    async update(actor: Actor, id: number, body: ProductBody) {
      const existing = await requireProduct(id);
      const { data, medication } = validateProduct(body);
      return withTransaction(
        async (tx) => {
          const product = await updateProduct(tx, id, data, medication);
          if (data.quantity !== existing.quantity) {
            await createMovement(tx, {
              productId: id,
              type: 'ajuste',
              quantityBefore: existing.quantity,
              quantityAfter: data.quantity,
              reason: 'Ajuste por edición',
              userId: actor.id,
            });
            await writeAudit(tx, {
              userId: actor.id,
              action: 'INVENTORY_MOVEMENT',
              entityType: 'Product',
              entityId: id,
              details: { type: 'ajuste', quantityBefore: existing.quantity, quantityAfter: data.quantity },
            });
          }
          return decorate(product);
        },
        { client: db },
      );
    },

    async remove(id: number) {
      await requireProduct(id);
      await withTransaction((tx) => deleteProduct(tx, id), { client: db });
    },

    async move(actor: Actor, id: number, body: MovementBody) {
      const product = await requireProduct(id);
      const result = applyMovement(product.quantity, { type: body.type, quantity: body.quantity });
      if (!result.ok) throw movementError(result.error);

      return withTransaction(
        async (tx) => {
          await setProductQuantity(tx, id, result.after);
          const movement = await createMovement(tx, {
            productId: id,
            type: body.type,
            quantityBefore: result.before,
            quantityAfter: result.after,
            reason: body.reason,
            userId: actor.id,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'INVENTORY_MOVEMENT',
            entityType: 'Product',
            entityId: id,
            details: { type: body.type, quantityBefore: result.before, quantityAfter: result.after },
          });
          return movement;
        },
        { client: db },
      );
    },

    async productMovements(id: number, query: ProductMovementsQuery) {
      await requireProduct(id);
      const rows = await listProductMovements(db, id);
      return {
        data: applyFilters(rows, [
          equals((row) => row.type, query.type),
          dateRange((row) => row.createdAt, { from: query.from, to: query.to }),
        ]),
      };
    },

    async movements(query: MovementListQuery) {
      const pagination = parsePagination(query as Record<string, unknown>);
      const rows = await listMovements(db);
      const filtered = applyFilters(rows, movementCriteria(query));
      return toPage(filtered.slice(pagination.skip, pagination.skip + pagination.take), filtered.length, pagination);
    },
  };
}

export type InventoryService = ReturnType<typeof createInventoryService>;
