// Método no permitido sobre una ruta existente: 405 con la cabecera Allow (Req. 12.7, 20.8, 25.6).
// Uso: router.get('/ruta', handler); router.all('/ruta', methodNotAllowed(['GET', 'HEAD']));

import type { RequestHandler } from 'express';
import { MethodNotAllowedError } from '../lib/errors';

export function methodNotAllowed(allowedMethods: readonly string[]): RequestHandler {
  const allow = allowedMethods.join(', ');
  return (_req, res, next) => {
    res.set('Allow', allow);
    next(new MethodNotAllowedError());
  };
}
