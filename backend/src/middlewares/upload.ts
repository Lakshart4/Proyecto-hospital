// Carga de archivos multipart con multer (Req. 5.13, 5.14, 19.1, 19.3).
//
// El archivo se recibe en memoria en un único campo llamado `file` (máximo 2 MB para fotos, 5 MB para
// documentos PDF). Los errores de multer se convierten en 400 con el campo afectado en español; nunca
// llegan al manejador de errores como 500. La validación del contenido (firma y tipo) la hace
// `validateUpload` en el servicio, antes de escribir nada en disco.

import type { RequestHandler } from 'express';
import multer from 'multer';
import { FILE_MESSAGES, MAX_PDF_BYTES, MAX_PHOTO_BYTES } from '../domain/files';
import { ValidationError } from '../lib/errors';

export const UPLOAD_FIELD = 'file';

const UPLOAD_MESSAGE = 'La carga del archivo no es válida.';

function translateUploadError(error: unknown, sizeMessage: string): unknown {
  if (!(error instanceof multer.MulterError)) return error;
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return new ValidationError(UPLOAD_MESSAGE, [{ field: UPLOAD_FIELD, message: sizeMessage }]);
    case 'LIMIT_UNEXPECTED_FILE':
      return new ValidationError(UPLOAD_MESSAGE, [{ field: UPLOAD_FIELD, message: `El archivo debe enviarse en el campo "${UPLOAD_FIELD}".` }]);
    case 'LIMIT_FILE_COUNT':
      return new ValidationError(UPLOAD_MESSAGE, [{ field: UPLOAD_FIELD, message: 'Solo se permite un archivo.' }]);
    default:
      return new ValidationError(UPLOAD_MESSAGE, [{ field: 'body', message: 'El formulario enviado no es válido.' }]);
  }
}

function singleUpload(maxBytes: number, sizeMessage: string, maxFields: number): RequestHandler {
  const receive = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: maxFields, parts: maxFields + 1, fieldSize: 2048 },
  }).single(UPLOAD_FIELD);

  return (req, res, next) => {
    receive(req, res, (error: unknown) => {
      if (error) next(translateUploadError(error, sizeMessage));
      else next();
    });
  };
}

/** Recibe una sola foto en el campo `file` (máximo 2 MB) y la deja en `req.file`. */
export function photoUpload(): RequestHandler {
  return singleUpload(MAX_PHOTO_BYTES, FILE_MESSAGES.photoSize, 5);
}

/** Recibe un único documento PDF en el campo `file` (máximo 5 MB) y lo deja en `req.file`. */
export function pdfUpload(): RequestHandler {
  return singleUpload(MAX_PDF_BYTES, FILE_MESSAGES.pdfSize, 10);
}
