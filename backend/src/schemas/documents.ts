// Esquemas zod de Documentos_de_Empleado (Req. 19.1, 19.3).

import { z } from 'zod';
import { DOCUMENT_TYPES } from '../domain/constants';
import { queryIntInRange, requiredText, REQUIRED_MESSAGE } from './common';

const MAX_ID = 2_147_483_647;

export const DOCUMENT_TYPE_MESSAGE = 'El tipo de documento debe ser contratación o acreditación.';
export const DOCUMENT_DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD y ser una fecha real.';

const isRealDate = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
};

const requiredDateField = z
  .string({ error: (issue) => (issue.input === undefined || issue.input === null ? REQUIRED_MESSAGE : DOCUMENT_DATE_MESSAGE) })
  .trim()
  .min(1, REQUIRED_MESSAGE)
  .refine(isRealDate, DOCUMENT_DATE_MESSAGE)
  .transform((text) => new Date(`${text}T00:00:00.000Z`));

const optionalDateField = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z
    .string({ error: DOCUMENT_DATE_MESSAGE })
    .trim()
    .refine(isRealDate, DOCUMENT_DATE_MESSAGE)
    .transform((text) => new Date(`${text}T00:00:00.000Z`))
    .nullable(),
);

export const docIdParamSchema = z.object({ docId: queryIntInRange(1, MAX_ID) });

export const documentBodySchema = z.object({
  type: z.enum(DOCUMENT_TYPES, { error: DOCUMENT_TYPE_MESSAGE }),
  title: requiredText({ max: 150 }),
  issuedAt: requiredDateField,
  expiresAt: optionalDateField.default(null),
});

export type DocumentBody = z.infer<typeof documentBodySchema>;
