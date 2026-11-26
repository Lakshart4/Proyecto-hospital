// Esquemas zod del módulo de Personal (Req. 3.3, 3.4, 5.2, 5.3, 5.5, 5.15).
// Las claves desconocidas se descartan: nunca se pasa al servicio un campo que el esquema no declara
// (por ejemplo `passwordHash`, `active` o `mustChangePassword`).

import { z } from 'zod';
import { EMPLOYEE_ROLES, SHIFTS } from '../domain/constants';
import { intInRange, queryIntInRange, requiredText, REQUIRED_MESSAGE, TEXT_TYPE_MESSAGE } from './common';

/** Mayor entero que admite la columna de SQLite para los identificadores. */
const MAX_ID = 2_147_483_647;

export const ROLE_MESSAGE = 'El rol debe ser Médico, Enfermero o Personal de limpieza.';
export const SHIFT_MESSAGE = 'El turno debe ser matutino o vespertino.';
export const EMAIL_MESSAGE = 'El correo electrónico no tiene un formato válido.';
export const BIRTH_DATE_MESSAGE = 'La fecha de nacimiento debe tener el formato AAAA-MM-DD y ser una fecha real.';
export const DESCRIPTION_MESSAGE = 'La descripción debe tener como máximo 500 caracteres.';

const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const emailField = z
  .string({ error: (issue) => (issue.input === undefined || issue.input === null ? REQUIRED_MESSAGE : TEXT_TYPE_MESSAGE) })
  .trim()
  .min(1, REQUIRED_MESSAGE)
  .max(254, 'Debe tener como máximo 254 caracteres.')
  .refine((value) => EMAIL_FORMAT.test(value), EMAIL_MESSAGE);

const isRealDate = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

/** Fecha sin hora (AAAA-MM-DD) que se guarda a las 00:00 UTC; opcional. */
const birthDateField = z
  .string({ error: BIRTH_DATE_MESSAGE })
  .refine(isRealDate, BIRTH_DATE_MESSAGE)
  .transform((text) => new Date(`${text}T00:00:00.000Z`))
  .nullish()
  .transform((value) => value ?? null);

export const idParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });

/** Cuerpo de alta y edición completa de un Empleado (Req. 5.2). El rol es un solo valor, nunca un arreglo (Req. 2.10). */
export const staffBodySchema = z.object({
  internalId: requiredText({ max: 30 }),
  email: emailField,
  role: z.enum(EMPLOYEE_ROLES, { error: ROLE_MESSAGE }),
  name: requiredText({ max: 100 }),
  position: requiredText({ max: 100 }),
  description: z
    .string({ error: TEXT_TYPE_MESSAGE })
    .trim()
    .max(500, DESCRIPTION_MESSAGE)
    .default(''),
  specialty: requiredText({ max: 100 }),
  departmentId: intInRange(1, MAX_ID),
  yearsExperience: intInRange(0, 60),
  shift: z.enum(SHIFTS, { error: SHIFT_MESSAGE }),
  phone: requiredText({ max: 30 }),
  birthDate: birthDateField,
});

export type StaffBody = z.infer<typeof staffBodySchema>;

/** Parámetro opcional de la query: vacío o con solo espacios se trata como no indicado. */
const optionalQuery = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema.optional());

export const staffListQuerySchema = z.object({
  role: optionalQuery(z.enum(EMPLOYEE_ROLES, { error: ROLE_MESSAGE })),
  departmentId: optionalQuery(queryIntInRange(1, MAX_ID)),
  shift: optionalQuery(z.enum(SHIFTS, { error: SHIFT_MESSAGE })),
  search: optionalQuery(z.string({ error: TEXT_TYPE_MESSAGE }).max(100, 'Debe tener como máximo 100 caracteres.')),
});

export type StaffListQuery = z.infer<typeof staffListQuerySchema>;

// ---------- Perfil propio (PATCH /staff/me) ----------

/** Claves que acepta PATCH /staff/me: foto y teléfono. La contraseña y el horario tienen sus propios endpoints. */
export const PATCH_ME_KEYS = ['photoUrl', 'phone'] as const;

export const patchMeBodySchema = z.object({
  phone: requiredText({ max: 30 }).optional(),
  photoUrl: z.string({ error: TEXT_TYPE_MESSAGE }).nullable().optional(),
});

export type PatchMeBody = z.infer<typeof patchMeBodySchema>;

// ---------- Horario_de_Trabajo (PUT /staff/:id/schedule) ----------

const timeField = z.string({ error: (issue) => (issue.input === undefined || issue.input === null ? REQUIRED_MESSAGE : TEXT_TYPE_MESSAGE) });
const optionalTimeField = z.string({ error: TEXT_TYPE_MESSAGE }).nullish();

/** Los formatos y reglas de las horas los valida `validateDaySchedule` (Req. 5.15) con el campo exacto. */
const dayField = z.object({
  dayOfWeek: intInRange(0, 6, { invalid: 'El día debe ser un número entero de 0 (domingo) a 6 (sábado).' }),
  startTime: timeField,
  endTime: timeField,
  mealStart: optionalTimeField,
  mealEnd: optionalTimeField,
  breaks: z
    .array(z.object({ startTime: timeField, endTime: timeField }), { error: 'Los descansos deben ser una lista.' })
    .max(20, 'Se permiten como máximo 3 descansos por día.')
    .default([]),
});

export const scheduleBodySchema = z.object({
  days: z.array(dayField, { error: 'Los días deben ser una lista.' }).max(7, 'Se permiten como máximo 7 días.'),
});

export type ScheduleBody = z.infer<typeof scheduleBodySchema>;
