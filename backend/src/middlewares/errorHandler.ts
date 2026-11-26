// Manejador central de errores (Req. 13.4, 13.8).
// Convierte cualquier error en el sobre { code, message, errors? } con mensaje en español usando
// toErrorResponse de lib/errors. Los errores no controlados se responden como 500 genérico; su traza
// solo se escribe en la consola del servidor, nunca en la respuesta.

import type { ErrorRequestHandler } from 'express';
import { ValidationError, toErrorResponse } from '../lib/errors';

export interface ErrorHandlerOptions {
  /** Dónde escribir los errores 500 (por defecto, console.error). */
  log?: (message: string) => void;
}

/** Errores del lector de JSON de Express (body-parser), reconocidos por su `type`. */
function translateBodyParserError(error: unknown): ValidationError | null {
  if (!error || typeof error !== 'object' || !('type' in error)) return null;
  switch ((error as { type: unknown }).type) {
    case 'entity.parse.failed':
      return new ValidationError('El cuerpo de la solicitud no es un JSON válido.', [
        { field: 'body', message: 'El JSON tiene un formato incorrecto.' },
      ]);
    case 'entity.too.large':
      return new ValidationError('El cuerpo de la solicitud es demasiado grande.', [
        { field: 'body', message: 'El contenido supera el tamaño máximo permitido.' },
      ]);
    case 'encoding.unsupported':
    case 'charset.unsupported':
      return new ValidationError('La codificación del cuerpo no es compatible. Usa JSON en UTF-8.', [
        { field: 'body', message: 'Codificación no compatible.' },
      ]);
    default:
      return null;
  }
}

export function errorHandler(options: ErrorHandlerOptions = {}): ErrorRequestHandler {
  const log = options.log ?? ((message: string) => console.error(message));

  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const { status, body } = toErrorResponse(translateBodyParserError(error) ?? error);
    if (status >= 500) {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      // Solo método y ruta (sin query string), para no registrar datos de la solicitud.
      log(`[error] ${req.method} ${req.path}: ${detail}`);
    }
    res.status(status).json(body);
  };
}
