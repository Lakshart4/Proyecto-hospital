import { z } from 'zod';
import { emailField, requiredText } from '../../shared/lib/validation';

export const EMPLOYEE_ROLES = ['DOCTOR', 'NURSE', 'CLEANING'] as const;
export const SHIFTS = ['matutino', 'vespertino'] as const;
export const DOCUMENT_TYPES = ['contratación', 'acreditación'] as const;

const isRealDate = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

export const staffFormSchema = z.object({
  internalId: requiredText(30),
  email: emailField(),
  role: z.enum(EMPLOYEE_ROLES, { error: 'Selecciona un rol válido.' }),
  name: requiredText(100),
  position: requiredText(100),
  description: z.string().refine((v) => v.trim().length <= 500, { error: 'Debe tener como máximo 500 caracteres.' }),
  specialty: requiredText(100),
  departmentId: z
    .string()
    .refine((v) => /^\d+$/.test(v) && Number(v) >= 1, { error: 'Selecciona un departamento.' }),
  yearsExperience: z
    .string()
    .refine((v) => /^\d+$/.test(v.trim()) && Number(v.trim()) >= 0 && Number(v.trim()) <= 60, {
      error: 'Debe ser un número entero entre 0 y 60.',
    }),
  shift: z.enum(SHIFTS, { error: 'Selecciona un turno válido.' }),
  phone: requiredText(30),
  birthDate: z
    .string()
    .refine((v) => v.trim() === '' || isRealDate(v.trim()), { error: 'Ingresa una fecha válida (AAAA-MM-DD).' }),
});

export type StaffFormValues = z.input<typeof staffFormSchema>;

export const ownPhoneSchema = z.object({
  phone: requiredText(30),
});

export const documentMetaSchema = z
  .object({
    type: z.enum(DOCUMENT_TYPES, { error: 'Selecciona un tipo de documento válido.' }),
    title: requiredText(150),
    issuedAt: z
      .string()
      .refine((v) => v.trim().length > 0, { error: 'La fecha de emisión es obligatoria.', abort: true })
      .refine((v) => isRealDate(v.trim()), { error: 'La fecha de emisión debe ser válida (AAAA-MM-DD).' }),
    expiresAt: z
      .string()
      .refine((v) => v.trim() === '' || isRealDate(v.trim()), { error: 'La fecha de vencimiento debe ser válida (AAAA-MM-DD).' }),
  })
  .refine(
    (data) => {
      if (data.expiresAt.trim() === '' || !isRealDate(data.issuedAt.trim()) || !isRealDate(data.expiresAt.trim())) return true;
      return data.expiresAt.trim() >= data.issuedAt.trim();
    },
    { error: 'La fecha de vencimiento no puede ser anterior a la de emisión.', path: ['expiresAt'] },
  );

export type DocumentFormValues = z.input<typeof documentMetaSchema>;
