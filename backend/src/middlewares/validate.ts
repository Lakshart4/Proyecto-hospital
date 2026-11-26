// Middleware de validación con zod (Req. 3.3, 3.4).
// Valida `body`, `query` y `params` con los esquemas indicados. Si alguno es inválido, responde 400
// (VALIDATION_ERROR) con `errors[]` por campo en español, sin ejecutar el controlador, así que no se
// crea ni modifica ningún registro. Si todo es válido, reemplaza cada parte por el valor validado
// (recortado, convertido y sin claves desconocidas).

import type { RequestHandler } from 'express';
import type { z } from 'zod';
import { ValidationError, type FieldError } from '../lib/errors';
import { spanishErrorMap } from '../schemas/common';

export const REQUEST_PARTS = ['params', 'query', 'body'] as const;
export type RequestPart = (typeof REQUEST_PARTS)[number];

export type ValidationSchemas = Partial<Record<RequestPart, z.ZodType>>;

/**
 * Convierte los errores de zod en errores por campo. El campo es la ruta del valor
 * (por ejemplo `name` o `breaks.0.startTime`); si el error afecta a la parte completa, se usa
 * el nombre de la parte (`body`, `query` o `params`). Se conserva el primer mensaje de cada campo.
 */
export function toFieldErrors(issues: readonly z.core.$ZodIssue[], part: RequestPart): FieldError[] {
  const errors: FieldError[] = [];
  for (const issue of issues) {
    const field = issue.path.length > 0 ? issue.path.map(String).join('.') : part;
    if (!errors.some((existing) => existing.field === field)) {
      errors.push({ field, message: issue.message });
    }
  }
  return errors;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req, _res, next) => {
    const errors: FieldError[] = [];
    const parsed: Partial<Record<RequestPart, unknown>> = {};

    for (const part of REQUEST_PARTS) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part], { error: spanishErrorMap });
      if (result.success) {
        parsed[part] = result.data;
      } else {
        for (const error of toFieldErrors(result.error.issues, part)) {
          if (!errors.some((existing) => existing.field === error.field)) errors.push(error);
        }
      }
    }

    if (errors.length > 0) {
      next(new ValidationError(undefined, errors));
      return;
    }

    // En Express 5 `req.query` es un getter de solo lectura; se define una propiedad propia
    // con el valor validado, que tiene prioridad sobre el getter.
    for (const part of REQUEST_PARTS) {
      if (part in parsed) {
        Object.defineProperty(req, part, { value: parsed[part], writable: true, enumerable: true, configurable: true });
      }
    }
    next();
  };
}
