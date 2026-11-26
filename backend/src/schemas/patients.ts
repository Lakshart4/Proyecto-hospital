// Esquemas zod de Pacientes, movimientos y Tratamientos_Programados (Req. 6, 20, 21).

import { z } from 'zod';
import { PATIENT_SEXES, PATIENT_STATUSES, TREATMENT_STATUSES, TREATMENT_TYPES } from '../domain/constants';
import { intInRange, queryIntInRange, requiredText, REQUIRED_MESSAGE, TEXT_TYPE_MESSAGE } from './common';

const MAX_ID = 2_147_483_647;

export const SEX_MESSAGE = 'El sexo debe ser F, M o X.';
export const DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD o ISO válida.';
export const STATUS_MESSAGE = 'El estado debe ser activo, dado de alta o fallecido.';
export const TREATMENT_TYPE_MESSAGE = 'El tipo debe ser tratamiento o cirugía.';
export const TREATMENT_STATUS_MESSAGE = 'El estado debe ser programado, realizado o cancelado.';

function parseDateInput(text: string): Date | null {
  const trimmed = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00.000Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === trimmed ? date : null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateField = (requiredMessage = REQUIRED_MESSAGE) =>
  z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? requiredMessage : DATE_MESSAGE) })
    .trim()
    .min(1, requiredMessage)
    .transform((text, ctx) => {
      const parsed = parseDateInput(text);
      if (parsed === null) {
        ctx.addIssue({ code: 'custom', message: DATE_MESSAGE });
        return z.NEVER;
      }
      return parsed;
    });

const optionalDateField = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z
    .string({ error: DATE_MESSAGE })
    .trim()
    .transform((text, ctx) => {
      const parsed = parseDateInput(text);
      if (parsed === null) {
        ctx.addIssue({ code: 'custom', message: DATE_MESSAGE });
        return z.NEVER;
      }
      return parsed;
    })
    .nullable(),
);

const optionalQuery = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());

export const patientIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });
export const treatmentParamsSchema = z.object({ id: queryIntInRange(1, MAX_ID), tid: queryIntInRange(1, MAX_ID) });

export const patientListQuerySchema = z
  .object({
    status: optionalQuery(z.enum(PATIENT_STATUSES, { error: STATUS_MESSAGE })),
    departmentId: optionalQuery(queryIntInRange(1, MAX_ID)),
    search: optionalQuery(z.string({ error: TEXT_TYPE_MESSAGE }).max(100, 'Debe tener como máximo 100 caracteres.')),
  })
  .passthrough();

export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

export const patientBodySchema = z.object({
  internalId: requiredText({ max: 30 }),
  firstName: requiredText({ max: 100 }),
  lastName: requiredText({ max: 100 }),
  birthDate: dateField(),
  sex: z.enum(PATIENT_SEXES, { error: SEX_MESSAGE }),
  phone: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z.string({ error: TEXT_TYPE_MESSAGE }).trim().max(30, 'Debe tener como máximo 30 caracteres.').nullable().optional(),
  ),
  admissionDate: dateField(),
  reason: requiredText({ max: 500 }),
  departmentId: intInRange(1, MAX_ID),
  doctorId: intInRange(1, MAX_ID),
  nurseId: intInRange(1, MAX_ID),
});

export type PatientBody = z.infer<typeof patientBodySchema>;

export const patientStatusBodySchema = z.object({
  status: z.enum(['dado de alta', 'fallecido'] as const, { error: 'El estado debe ser dado de alta o fallecido.' }),
  deceasedAt: optionalDateField.default(null),
  note: z.string({ error: TEXT_TYPE_MESSAGE }).trim().max(500, 'Debe tener como máximo 500 caracteres.').default(''),
});

export type PatientStatusBody = z.infer<typeof patientStatusBodySchema>;

export const readmissionBodySchema = z.object({
  admissionDate: dateField(),
  departmentId: intInRange(1, MAX_ID),
  reason: requiredText({ max: 500 }),
});

export type ReadmissionBody = z.infer<typeof readmissionBodySchema>;

export const observationBodySchema = z.object({
  text: z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? REQUIRED_MESSAGE : TEXT_TYPE_MESSAGE) })
    .trim()
    .max(1000, 'Debe tener como máximo 1000 caracteres.'),
});

export type ObservationBody = z.infer<typeof observationBodySchema>;

export const treatmentListQuerySchema = z.object({
  type: optionalQuery(z.enum(TREATMENT_TYPES, { error: TREATMENT_TYPE_MESSAGE })),
  status: optionalQuery(z.enum(TREATMENT_STATUSES, { error: TREATMENT_STATUS_MESSAGE })),
});

export type TreatmentListQuery = z.infer<typeof treatmentListQuerySchema>;

export const treatmentBodySchema = z.object({
  type: z.enum(TREATMENT_TYPES, { error: TREATMENT_TYPE_MESSAGE }),
  scheduledAt: dateField(),
  description: requiredText({ max: 500 }),
});

export type TreatmentBody = z.infer<typeof treatmentBodySchema>;

export const treatmentStatusBodySchema = z.object({
  status: z.enum(['realizado', 'cancelado'] as const, { error: 'El estado debe ser realizado o cancelado.' }),
});

export type TreatmentStatusBody = z.infer<typeof treatmentStatusBodySchema>;
