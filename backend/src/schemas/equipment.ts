// Esquemas zod de Equipos_Médicos y Registros_de_Mantenimiento (Req. 8, 26).

import { z } from 'zod';
import { MAINTENANCE_RESULT_STATUSES, MAINTENANCE_TYPES, OPERATIONAL_STATUSES } from '../domain/constants';
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

export const EQUIPMENT_QUANTITY_MESSAGE = 'La cantidad debe ser un número entero entre 1 y 9999.';
export const OPERATIONAL_STATUS_MESSAGE = 'El estado operativo debe ser disponible, en uso, en mantenimiento o fuera de servicio.';
export const MAINTENANCE_TYPE_MESSAGE = 'El tipo debe ser preventivo, correctivo o reparación.';
export const RESULT_STATUS_MESSAGE = 'El estado resultante debe ser "disponible" o "fuera de servicio".';

const optionalEnum = <T extends readonly [string, ...string[]]>(values: T, message: string) =>
  z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(values, { error: message }).optional(),
  );

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

export const equipmentIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });
export const maintenanceIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });

export const equipmentListQuerySchema = z
  .object({
    departmentId: optionalQueryIntInRange(1, MAX_ID),
    category: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string({ error: TEXT_TYPE_MESSAGE }).max(50, 'Debe tener como máximo 50 caracteres.').optional(),
    ),
    status: optionalEnum(OPERATIONAL_STATUSES, OPERATIONAL_STATUS_MESSAGE),
    search: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.string({ error: TEXT_TYPE_MESSAGE }).max(100, 'Debe tener como máximo 100 caracteres.').optional(),
    ),
  })
  .passthrough();

export type EquipmentListQuery = z.infer<typeof equipmentListQuerySchema>;

export const equipmentBodySchema = z.object({
  name: requiredText({ max: 100 }),
  category: requiredText({ max: 50 }),
  departmentId: intInRange(1, MAX_ID),
  quantity: intInRange(1, 9999, { invalid: EQUIPMENT_QUANTITY_MESSAGE }),
  location: requiredText({ max: 100 }),
  operationalStatus: z.enum(OPERATIONAL_STATUSES, { error: OPERATIONAL_STATUS_MESSAGE }),
  maintenanceRequired: z.boolean({ error: 'El indicador de mantenimiento requerido debe ser verdadero o falso.' }).default(false),
});

export type EquipmentBody = z.infer<typeof equipmentBodySchema>;

export const equipmentStatusBodySchema = z.object({
  operationalStatus: z.enum(OPERATIONAL_STATUSES, { error: OPERATIONAL_STATUS_MESSAGE }),
});

export type EquipmentStatusBody = z.infer<typeof equipmentStatusBodySchema>;

export const maintenanceListQuerySchema = z
  .object({
    equipmentId: optionalQueryIntInRange(1, MAX_ID),
    departmentId: optionalQueryIntInRange(1, MAX_ID),
    type: optionalEnum(MAINTENANCE_TYPES, MAINTENANCE_TYPE_MESSAGE),
    open: queryBooleanField(),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type MaintenanceListQuery = z.infer<typeof maintenanceListQuerySchema>;

export const maintenanceBodySchema = z.object({
  equipmentId: intInRange(1, MAX_ID),
  type: z.enum(MAINTENANCE_TYPES, { error: MAINTENANCE_TYPE_MESSAGE }),
  startDate: dateInput('La fecha de inicio es obligatoria y debe ser una fecha válida.'),
  description: requiredText({ max: 500 }),
  technician: requiredText({ max: 100 }),
});

export type MaintenanceBody = z.infer<typeof maintenanceBodySchema>;

export const closeMaintenanceBodySchema = z.object({
  endDate: dateInput('La fecha de fin es obligatoria y debe ser una fecha válida.'),
  resultingStatus: z.enum(MAINTENANCE_RESULT_STATUSES, { error: RESULT_STATUS_MESSAGE }),
});

export type CloseMaintenanceBody = z.infer<typeof closeMaintenanceBodySchema>;
