import { z } from 'zod';
import { requiredText } from '../../shared/lib/validation';

export const PATIENT_STATUSES = ['activo', 'dado de alta', 'fallecido'] as const;
export const PATIENT_SEXES = ['F', 'M', 'X'] as const;
export const TREATMENT_TYPES = ['tratamiento', 'cirugía'] as const;
export const TREATMENT_STATUSES = ['programado', 'realizado', 'cancelado'] as const;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localToday(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

const requiredDate = (label: string) =>
  z
    .string()
    .refine((value) => value.trim() !== '', { error: `${label} es obligatoria.`, abort: true })
    .refine((value) => isRealDate(value.trim()), { error: 'Ingresa una fecha válida (AAAA-MM-DD).' });

const responsibleId = z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, {
  error: 'Selecciona una persona responsable.',
});

const departmentId = z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, {
  error: 'Selecciona un departamento.',
});

export const patientFormSchema = z.object({
  internalId: requiredText(30),
  firstName: requiredText(100),
  lastName: requiredText(100),
  birthDate: requiredDate('La fecha de nacimiento'),
  sex: z.enum(PATIENT_SEXES, { error: 'Selecciona un sexo válido.' }),
  phone: z.string().max(30, 'Debe tener como máximo 30 caracteres.'),
  admissionDate: requiredDate('La fecha de ingreso').refine((value) => value <= localToday(), {
    error: 'La fecha de ingreso no puede ser posterior a hoy.',
  }),
  reason: requiredText(500),
  departmentId,
  doctorId: responsibleId,
  nurseId: responsibleId,
});

export type PatientFormValues = z.input<typeof patientFormSchema>;

export const observationSchema = z.object({
  text: z.string().max(1000, 'Debe tener como máximo 1000 caracteres.'),
});

export const treatmentFormSchema = z.object({
  type: z.enum(TREATMENT_TYPES, { error: 'Selecciona un tipo válido.' }),
  scheduledAt: z
    .string()
    .refine((value) => value.trim() !== '', { error: 'La fecha y hora son obligatorias.', abort: true })
    .refine((value) => !Number.isNaN(new Date(value).getTime()), { error: 'Ingresa una fecha y hora válidas.' }),
  description: requiredText(500),
});

export type TreatmentFormValues = z.input<typeof treatmentFormSchema>;

export const readmissionFormSchema = z.object({
  admissionDate: requiredDate('La fecha de reingreso').refine((value) => value <= localToday(), {
    error: 'La fecha de reingreso no puede ser posterior a hoy.',
  }),
  departmentId,
  reason: requiredText(500),
});

export type ReadmissionFormValues = z.input<typeof readmissionFormSchema>;
