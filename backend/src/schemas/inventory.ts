// Esquemas zod del Inventario médico y del Inventario de limpieza (Req. 7, 22, 23, 25).

import { z } from 'zod';
import {
  CONTROL_CLASSES,
  INVENTORY_MOVEMENT_TYPES,
  MEDICATION_TYPES,
  PRODUCT_AVAILABILITY,
  PRODUCT_CATEGORIES,
  SUPPLY_SUBCATEGORIES,
} from '../domain/constants';
import {
  intInRange,
  optionalQueryIntInRange,
  queryBooleanField,
  queryDateField,
  queryIntInRange,
  requiredText,
  TEXT_TYPE_MESSAGE,
} from './common';
const MAX_ID = 2_147_483_647;

export const PRODUCT_NAME_MESSAGE = 'El nombre debe tener entre 1 y 100 caracteres.';
export const CLASSIFICATION_MESSAGE = 'La clasificación debe tener entre 1 y 50 caracteres.';
export const CATEGORY_MESSAGE = 'La categoría debe ser insumo médico, medicamento o material de limpieza.';
export const SUB_CATEGORY_MESSAGE = 'La subcategoría debe ser jeringa, sonda, catéter, suero, instrumental o material médico.';
export const MEDICATION_TYPE_MESSAGE = 'El tipo de medicamento debe ser genérico o de patente.';
export const CONTROL_CLASS_MESSAGE = 'La clasificación de control no es válida.';
export const QUANTITY_MESSAGE = 'La cantidad debe ser un número entero entre 0 y 999999.';
export const MOVEMENT_TYPE_MESSAGE = 'El tipo de movimiento debe ser entrada, salida o ajuste.';
export const MOVEMENT_REASON_MESSAGE = 'El motivo es obligatorio y debe tener como máximo 200 caracteres.';

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(values, { error: message }).optional(),
  );

export const productIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });

export const productListQuerySchema = z
  .object({
    category: optionalEnum(PRODUCT_CATEGORIES, CATEGORY_MESSAGE),
    subcategory: optionalEnum(SUPPLY_SUBCATEGORIES, SUB_CATEGORY_MESSAGE),
    availability: optionalEnum(PRODUCT_AVAILABILITY, 'La disponibilidad debe ser "disponible" o "agotado".'),
    lowStock: queryBooleanField(),
    supplierId: optionalQueryIntInRange(1, MAX_ID),
    medicationType: optionalEnum(MEDICATION_TYPES, MEDICATION_TYPE_MESSAGE),
    controlClass: optionalEnum(CONTROL_CLASSES, CONTROL_CLASS_MESSAGE),
    requiresPrescription: queryBooleanField(),
    controlled: queryBooleanField(),
    search: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string({ error: TEXT_TYPE_MESSAGE }).max(100, 'Debe tener como máximo 100 caracteres.').optional(),
    ),
  })
  .passthrough();

export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const medicationInfoSchema = z.object({
  type: z.enum(MEDICATION_TYPES, { error: MEDICATION_TYPE_MESSAGE }),
  activeIngredient: requiredText({ max: 100 }),
  tradeName: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    z.string({ error: TEXT_TYPE_MESSAGE }).trim().max(100, 'Debe tener como máximo 100 caracteres.').nullable().optional(),
  ),
  controlClass: z.enum(CONTROL_CLASSES, { error: CONTROL_CLASS_MESSAGE }),
  requiresPrescription: z.boolean({ error: 'El indicador de receta requerida debe ser verdadero o falso.' }),
});

export type MedicationInfoBody = z.infer<typeof medicationInfoSchema>;

export const productBodySchema = z.object({
  name: requiredText({ max: 100, tooLong: PRODUCT_NAME_MESSAGE }),
  category: z.enum(PRODUCT_CATEGORIES, { error: CATEGORY_MESSAGE }),
  classification: requiredText({ max: 50, tooLong: CLASSIFICATION_MESSAGE }),
  quantity: intInRange(0, 999_999, { invalid: QUANTITY_MESSAGE }),
  minStock: intInRange(0, 999_999, { invalid: 'El stock mínimo debe ser un número entero entre 0 y 999999.' }),
  supplierId: intInRange(1, MAX_ID),
  medicationInfo: z.preprocess((value) => (value === null ? undefined : value), medicationInfoSchema.optional()),
});

export type ProductBody = z.infer<typeof productBodySchema>;

export const movementBodySchema = z.object({
  type: z.enum(INVENTORY_MOVEMENT_TYPES, { error: MOVEMENT_TYPE_MESSAGE }),
  quantity: intInRange(0, 999_999, { invalid: QUANTITY_MESSAGE }),
  reason: requiredText({ max: 200, tooLong: MOVEMENT_REASON_MESSAGE }),
});

export type MovementBody = z.infer<typeof movementBodySchema>;

export const movementListQuerySchema = z
  .object({
    productId: optionalQueryIntInRange(1, MAX_ID),
    category: optionalEnum(PRODUCT_CATEGORIES, CATEGORY_MESSAGE),
    type: optionalEnum(INVENTORY_MOVEMENT_TYPES, MOVEMENT_TYPE_MESSAGE),
    userId: optionalQueryIntInRange(1, MAX_ID),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type MovementListQuery = z.infer<typeof movementListQuerySchema>;

export const productMovementsQuerySchema = z
  .object({
    type: optionalEnum(INVENTORY_MOVEMENT_TYPES, MOVEMENT_TYPE_MESSAGE),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type ProductMovementsQuery = z.infer<typeof productMovementsQuerySchema>;
