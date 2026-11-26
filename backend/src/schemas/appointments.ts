import { z } from 'zod';
import { APPOINTMENT_STATUSES } from '../domain/constants';
import { intInRange, optionalQueryIntInRange, queryDateField, queryIntInRange, requiredText, TEXT_TYPE_MESSAGE } from './common';

const MAX_ID = 2_147_483_647;
const DATE_MESSAGE = 'La fecha y hora de la cita no son válidas.';

const instantField = z.string({ error: DATE_MESSAGE }).trim().min(1, 'La fecha y hora son obligatorias.').transform((value, ctx) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    ctx.addIssue({ code: 'custom', message: DATE_MESSAGE });
    return z.NEVER;
  }
  return date;
});

export const appointmentIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });
export const appointmentBodySchema = z.object({
  patientId: intInRange(1, MAX_ID),
  doctorId: intInRange(1, MAX_ID),
  scheduledAt: instantField,
  durationMinutes: intInRange(10, 240, { invalid: 'La duración debe ser un entero entre 10 y 240 minutos.' }),
  reason: requiredText({ max: 500 }),
  notes: z.string({ error: TEXT_TYPE_MESSAGE }).trim().max(1000, 'Las notas no pueden superar 1000 caracteres.').default(''),
}).strict();
export const cancelAppointmentBodySchema = z.object({
  reason: z.string({ error: TEXT_TYPE_MESSAGE }).trim().max(500, 'El motivo no puede superar 500 caracteres.').default(''),
}).strict();
export const appointmentListQuerySchema = z.object({
  patientId: optionalQueryIntInRange(1, MAX_ID),
  doctorId: optionalQueryIntInRange(1, MAX_ID),
  status: z.preprocess((value) => value === '' ? undefined : value, z.enum(APPOINTMENT_STATUSES).optional()),
  from: queryDateField(),
  to: queryDateField(),
}).passthrough();

export type AppointmentBody = z.infer<typeof appointmentBodySchema>;
export type CancelAppointmentBody = z.infer<typeof cancelAppointmentBodySchema>;
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;
