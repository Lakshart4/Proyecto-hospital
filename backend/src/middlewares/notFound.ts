// Ruta inexistente: 404 con el sobre de error estándar (Req. 13.4).

import type { RequestHandler } from 'express';
import { NotFoundError } from '../lib/errors';

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new NotFoundError('La ruta solicitada no existe.'));
};
