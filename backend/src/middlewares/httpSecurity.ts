import type { RequestHandler } from 'express';

// Política compatible con el bundle estático de Vite, React, imágenes locales y descargas Blob.
// No necesita 'unsafe-eval' ni recursos remotos. Los estilos inline se permiten porque algunos
// componentes usan el atributo style para barras de progreso calculadas con datos reales.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export interface HttpSecurityOptions {
  production: boolean;
}

/** Encabezados globales de defensa en profundidad; no modifica autenticación ni respuestas. */
export function httpSecurity(options: HttpSecurityOptions): RequestHandler {
  return (_req, res, next) => {
    res.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
    if (options.production) {
      // Render sirve la aplicación mediante HTTPS. No se envía HSTS en desarrollo local.
      res.set('Strict-Transport-Security', 'max-age=31536000');
    }
    next();
  };
}
