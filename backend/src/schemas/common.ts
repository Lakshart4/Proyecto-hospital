// Esquemas zod comunes del Backend (Req. 3.3, 3.4).
// Los esquemas de cada recurso se construyen con estos helpers para validar de forma uniforme
// campos obligatorios, longitudes y enteros con rango, con mensajes en español.

import { z } from 'zod';
import { parseIntegerString } from '../domain/others';

/**
 * Mensajes en español para los errores que no tienen un mensaje propio en el esquema.
 * Se pasa en cada `safeParse` (ver middlewares/validate.ts), sin cambiar la configuración global de zod.
 */
export const spanishErrorMap = z.locales.es().localeError;

export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';
export const TEXT_TYPE_MESSAGE = 'Debe ser un texto.';
export const NUMBER_TYPE_MESSAGE = 'Debe ser un número.';
export const INTEGER_MESSAGE = 'Debe ser un número entero.';

const isMissing = (input: unknown) => input === undefined || input === null;

const tooLongMessage = (max: number) => `Debe tener como máximo ${max} caracteres.`;
const rangeMessage = (min: number, max: number) => `Debe ser un número entero entre ${min} y ${max}.`;

function assertRange(min: number, max: number): void {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new RangeError(`Rango de enteros inválido: [${min}, ${max}].`);
  }
}

export interface RequiredTextOptions {
  /** Longitud máxima después de quitar los espacios de los extremos. */
  max: number;
  /** Mensaje si falta o queda vacío (por defecto, "Este campo es obligatorio."). */
  required?: string;
  /** Mensaje si supera `max`. */
  tooLong?: string;
}

/**
 * Texto obligatorio: quita los espacios de los extremos (`trim`) y exige al menos un carácter,
 * así que una cadena con solo espacios se rechaza (Req. 3.1, 3.3). El valor validado ya va recortado.
 */
export function requiredText({ max, required = REQUIRED_MESSAGE, tooLong }: RequiredTextOptions) {
  if (!Number.isSafeInteger(max) || max < 1) throw new RangeError(`Longitud máxima inválida: ${max}.`);
  return z
    .string({ error: (issue) => (isMissing(issue.input) ? required : TEXT_TYPE_MESSAGE) })
    .trim()
    .min(1, required)
    .max(max, tooLong ?? tooLongMessage(max));
}

export interface IntegerOptions {
  /** Mensaje si falta el valor. */
  required?: string;
  /** Mensaje si el valor no es entero o está fuera de rango. */
  invalid?: string;
}

/**
 * Entero de un cuerpo JSON dentro de [min, max]. Solo acepta números (un texto como "5" se rechaza).
 */
export function intInRange(min: number, max: number, options: IntegerOptions = {}) {
  assertRange(min, max);
  const required = options.required ?? REQUIRED_MESSAGE;
  const invalid = options.invalid ?? rangeMessage(min, max);
  return z
    .number({ error: (issue) => (isMissing(issue.input) ? required : NUMBER_TYPE_MESSAGE) })
    .int(options.invalid ?? INTEGER_MESSAGE)
    .min(min, invalid)
    .max(max, invalid);
}

/**
 * Entero recibido como texto en la query string o en los parámetros de ruta, dentro de [min, max].
 * Usa la misma interpretación estricta que la paginación (`parseIntegerString`): solo dígitos,
 * sin espacios, decimales ni exponentes. Para un parámetro opcional, añade `.optional()`.
 */
export function queryIntInRange(min: number, max: number, options: IntegerOptions = {}) {
  assertRange(min, max);
  const required = options.required ?? REQUIRED_MESSAGE;
  const invalid = options.invalid ?? rangeMessage(min, max);
  return z.unknown().transform((value, ctx) => {
    if (isMissing(value)) {
      ctx.addIssue({ code: 'custom', message: required });
      return z.NEVER;
    }
    const parsed = parseIntegerString(value);
    if (parsed === null || parsed < min || parsed > max) {
      ctx.addIssue({ code: 'custom', message: invalid });
      return z.NEVER;
    }
    return parsed;
  });
}

/** Entero opcional de la query string: ausente o vacío se considera no indicado. */
export function optionalQueryIntInRange(min: number, max: number, options: IntegerOptions = {}) {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    queryIntInRange(min, max, options).optional(),
  );
}

export const QUERY_DATE_MESSAGE = 'La fecha debe tener el formato AAAA-MM-DD o ISO válida.';

/** Fecha obligatoria de la query string (`AAAA-MM-DD` o ISO válida) como `Date`. */
export function requiredQueryDateField() {
  return z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? REQUIRED_MESSAGE : QUERY_DATE_MESSAGE) })
    .trim()
    .min(1, REQUIRED_MESSAGE)
    .transform((text, ctx) => {
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: 'custom', message: QUERY_DATE_MESSAGE });
        return z.NEVER;
      }
      return parsed;
    });
}

/** Fecha de la query string (`AAAA-MM-DD` o ISO válida) como `Date`. */
export function queryDateField() {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z
      .string({ error: QUERY_DATE_MESSAGE })
      .trim()
      .transform((text, ctx) => {
        const parsed = new Date(text);
        if (Number.isNaN(parsed.getTime())) {
          ctx.addIssue({ code: 'custom', message: QUERY_DATE_MESSAGE });
          return z.NEVER;
        }
        return parsed;
      })
      .optional(),
  );
}

export const QUERY_BOOLEAN_MESSAGE = 'Debe ser verdadero o falso.';

/** Booleano de la query string (`true` o `false`); ausente o vacío se considera no indicado. */
export function queryBooleanField() {
  return z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      if (value.trim() === '') return undefined;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    },
    z.boolean({ error: QUERY_BOOLEAN_MESSAGE }).optional(),
  );
}
