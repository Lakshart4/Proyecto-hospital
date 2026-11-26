import { z } from 'zod';
import { requiredText } from '../../shared/lib/validation';
import {
  MAINTENANCE_RESULT_STATUSES,
  MAINTENANCE_TYPES,
  OPERATIONAL_STATUSES,
} from './types';

const isRealDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const dateField = (label: string) =>
  z.string()
    .refine((value) => value.trim().length > 0, { error: `${label} es obligatoria.`, abort: true })
    .refine((value) => isRealDate(value.trim()), { error: `${label} debe ser válida (AAAA-MM-DD).` });

export function todayInputValue(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

export const equipmentFormSchema = z.object({
  name: requiredText(100),
  category: requiredText(50),
  departmentId: z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, {
    error: 'Selecciona un departamento.',
  }),
  quantity: z.string().refine((value) => /^\d+$/.test(value.trim()) && Number(value.trim()) >= 1 && Number(value.trim()) <= 9999, {
    error: 'La cantidad debe ser un número entero entre 1 y 9999.',
  }),
  location: requiredText(100),
  operationalStatus: z.enum(OPERATIONAL_STATUSES, {
    error: 'Selecciona un estado operativo válido.',
  }),
  maintenanceRequired: z.boolean(),
});

export type EquipmentFormValues = z.input<typeof equipmentFormSchema>;

export const openMaintenanceSchema = z.object({
  equipmentId: z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, {
    error: 'Selecciona un equipo.',
  }),
  type: z.enum(MAINTENANCE_TYPES, { error: 'Selecciona un tipo de mantenimiento válido.' }),
  startDate: dateField('La fecha de inicio').refine((value) => value <= todayInputValue(), {
    error: 'La fecha de inicio no puede ser posterior a hoy.',
  }),
  description: requiredText(500),
  technician: requiredText(100),
});

export type OpenMaintenanceFormValues = z.input<typeof openMaintenanceSchema>;

export const closeMaintenanceSchema = z.object({
  endDate: dateField('La fecha de fin'),
  resultingStatus: z.enum(MAINTENANCE_RESULT_STATUSES, {
    error: 'Selecciona disponible o fuera de servicio.',
  }),
});

export type CloseMaintenanceFormValues = z.input<typeof closeMaintenanceSchema>;

export const EQUIPMENT_FIELDS = ['name', 'category', 'departmentId', 'quantity', 'location', 'operationalStatus', 'maintenanceRequired'] as const;
export const OPEN_MAINTENANCE_FIELDS = ['equipmentId', 'type', 'startDate', 'description', 'technician'] as const;
export const CLOSE_MAINTENANCE_FIELDS = ['endDate', 'resultingStatus'] as const;
