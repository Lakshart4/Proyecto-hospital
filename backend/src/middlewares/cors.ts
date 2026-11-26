// Política CORS (Req. 13.9, 13.10).
// - Sin cabecera Origin (curl, llamadas del mismo servidor, proxy de Vite): sin CORS, la solicitud sigue.
// - Origin igual a CORS_ORIGIN: CORS con credenciales; el preflight se responde de inmediato con 204.
// - Cualquier otro Origin: 403 sin ninguna cabecera Access-Control-*.
// El paquete `cors` por sí solo añadiría Access-Control-Allow-Credentials y las cabeceras de preflight
// también a los orígenes ajenos, por eso solo se aplica cuando el origen coincide.

import cors from 'cors';
import type { RequestHandler } from 'express';
import { ForbiddenError } from '../lib/errors';

export const CORS_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const PREFLIGHT_MAX_AGE_SECONDS = 600;

export function corsPolicy(allowedOrigin: string): RequestHandler {
  const allowCors = cors({
    origin: allowedOrigin,
    credentials: true,
    methods: [...CORS_METHODS],
    allowedHeaders: ['Content-Type'],
    maxAge: PREFLIGHT_MAX_AGE_SECONDS,
  });

  return (req, res, next) => {
    // La respuesta depende del origen: las cachés no deben mezclar respuestas de orígenes distintos.
    res.vary('Origin');
    const origin = req.headers.origin;
    if (origin === undefined) {
      next();
      return;
    }
    if (origin === allowedOrigin) {
      allowCors(req, res, next);
      return;
    }
    next(new ForbiddenError('El origen de la solicitud no está permitido.'));
  };
}
