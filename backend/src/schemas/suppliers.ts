// Esquemas zod de Proveedores y Entregas_de_Proveedor (Req. 7.12, 24).

import { z } from 'zod';
import { DELIVERY_STATUSES } from '../domain/constants';
import {
  intInRange,
  optionalQueryIntInRange,
  queryDateField,
  queryIntInRange,
  requiredText,
  TEXT_TYPE_MESSAGE,
} from './common';

const MAX_ID = 2_147_483_647;

export const SUPPLIER_NAME_MESSAGE = 'El nombre del proveedor debe tener entre 1 y 100 caracteres.';
export const SUPPLIER_CONTACT_MESSAGE = 'El contacto debe tener entre 1 y 150 caracteres.';
export const DELIVERY_QUANTITY_MESSAGE = 'La cantidad solicitada debe ser un número entero entre 1 y 999999.';
export const DELIVERY_STATUS_MESSAGE = 'El estado debe ser programada, recibida o cancelada.';

export const supplierIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });
export const deliveryIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });

export const supplierBodySchema = z.object({
  name: requiredText({ max: 100, tooLong: SUPPLIER_NAME_MESSAGE }),
  contact: requiredText({ max: 150, tooLong: SUPPLIER_CONTACT_MESSAGE }),
});

export type SupplierBody = z.infer<typeof supplierBodySchema>;

const dateInput = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .min(1, message)
    .transform((text, ctx) => {
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return parsed;
    });

export const deliveryBodySchema = z.object({
  supplierId: intInRange(1, MAX_ID),
  productId: intInRange(1, MAX_ID),
  quantityRequested: intInRange(1, 999_999, { invalid: DELIVERY_QUANTITY_MESSAGE }),
  scheduledDate: dateInput('La fecha programada es obligatoria y debe ser una fecha válida.'),
});

export type DeliveryBody = z.infer<typeof deliveryBodySchema>;

export const receiveDeliveryBodySchema = z.object({
  receivedDate: dateInput('La fecha de recepción es obligatoria y debe ser una fecha válida.'),
  quantityReceived: intInRange(1, 999_999, { invalid: 'La cantidad recibida debe ser un número entero entre 1 y 999999.' }),
});

export type ReceiveDeliveryBody = z.infer<typeof receiveDeliveryBodySchema>;

export const deliveryListQuerySchema = z
  .object({
    supplierId: optionalQueryIntInRange(1, MAX_ID),
    productId: optionalQueryIntInRange(1, MAX_ID),
    status: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(DELIVERY_STATUSES, { error: DELIVERY_STATUS_MESSAGE }).optional(),
    ),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;

export const supplierSearchQuerySchema = z
  .object({
    search: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string({ error: TEXT_TYPE_MESSAGE }).max(100, 'Debe tener como máximo 100 caracteres.').optional(),
    ),
  })
  .passthrough();
