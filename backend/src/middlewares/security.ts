// Middlewares de seguridad (Req. 1.5, 1.6, 2.1, 2.2, 2.7, 5.12, 18.5).
//
// Orden en las rutas protegidas: authenticate (401) → requirePasswordChange (403
// PASSWORD_CHANGE_REQUIRED) → authorize (403) → requireAdminAuthorization cuando aplica (403
// AUTORIZACION_ADMIN_REQUERIDA) → alcance en el servicio (403) → validate (400) → reglas de negocio
// (404/409). Las respuestas 401 y 403 nunca incluyen datos del recurso.
//
// Las cookies `sid` (Sesión) y `aid` (Autorización_Administrativa) van firmadas con SESSION_SECRET
// (cookie-parser); una cookie alterada o sin firma se trata como ausente.

import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express';
import { can, type Action, type Resource } from '../domain/permissions';
import { AdminAuthorizationRequiredError, ForbiddenError, PasswordChangeRequiredError, TooManyRequestsError, UnauthenticatedError } from '../lib/errors';
import type { AuthContext, AuthService } from '../services/auth.service';
import type { AttemptLimiter } from './attemptLimiter';

export const SESSION_COOKIE = 'sid';
export const ADMIN_AUTH_COOKIE = 'aid';

declare module 'express-serve-static-core' {
  interface Request {
    /** Contexto de la Sesión, presente después de `authenticate`. */
    auth?: AuthContext;
  }
}

/** Atributos de las cookies: HttpOnly, SameSite=Strict, Path=/, firmadas, Secure en producción y sin Max-Age. */
export function cookieOptions(secure: boolean): CookieOptions {
  return { httpOnly: true, sameSite: 'strict', path: '/', secure, signed: true };
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  const { signed: _signed, ...options } = cookieOptions(secure);
  res.clearCookie(SESSION_COOKIE, options);
  res.clearCookie(ADMIN_AUTH_COOKIE, options);
}

/** Valor de una cookie firmada válida, o null si falta, no es texto o su firma no coincide. */
export function signedCookie(req: Request, name: string): string | null {
  const value: unknown = (req.signedCookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value !== '' ? value : null;
}

export interface SecurityDeps {
  auth: AuthService;
  secureCookies: boolean;
  now: () => Date;
}

export interface Security {
  authenticate: RequestHandler;
  requirePasswordChange: RequestHandler;
  authorize: (resource: Resource, action: Action) => RequestHandler;
  requireAdminAuthorization: RequestHandler;
  limitAttempts: (limiter: AttemptLimiter, keyOf: (req: Request) => string) => RequestHandler;
  /** Cuenta la solicitud como intento (recuperación: cada solicitud cuenta, exista o no la cuenta). */
  countAttempt: (limiter: AttemptLimiter, keyOf: (req: Request) => string) => RequestHandler;
  /** authenticate → requirePasswordChange → authorize, para las rutas de los módulos. */
  protect: (resource: Resource, action: Action) => RequestHandler[];
}

export function createSecurity(deps: SecurityDeps): Security {
  const authenticate: RequestHandler = (req, res, next) => {
    const token = signedCookie(req, SESSION_COOKIE);
    const fail = () => {
      clearAuthCookies(res, deps.secureCookies);
      next(new UnauthenticatedError());
    };
    if (token === null) return fail();
    deps.auth.authenticate(token).then((context) => {
      if (context === null) return fail();
      req.auth = context;
      next();
    }, next);
  };

  const requirePasswordChange: RequestHandler = (req, _res, next) => {
    if (req.auth?.user.mustChangePassword) return next(new PasswordChangeRequiredError());
    next();
  };

  const authorize = (resource: Resource, action: Action): RequestHandler => (req, _res, next) => {
    if (!req.auth) return next(new UnauthenticatedError());
    if (!can(req.auth.user.role, resource, action)) return next(new ForbiddenError());
    next();
  };

  const requireAdminAuthorization: RequestHandler = (req, _res, next) => {
    const token = signedCookie(req, ADMIN_AUTH_COOKIE);
    if (!req.auth) return next(new UnauthenticatedError());
    if (token === null) return next(new AdminAuthorizationRequiredError());
    deps.auth.hasValidAdminAuthorization(token, req.auth.sessionId).then(
      (valid) => next(valid ? undefined : new AdminAuthorizationRequiredError()),
      next,
    );
  };

  const limitAttempts = (limiter: AttemptLimiter, keyOf: (req: Request) => string): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      if (limiter.isBlocked(keyOf(req), deps.now())) return next(new TooManyRequestsError());
      next();
    };

  const countAttempt = (limiter: AttemptLimiter, keyOf: (req: Request) => string): RequestHandler =>
    (req: Request, _res: Response, next: NextFunction) => {
      limiter.registerFailure(keyOf(req), deps.now());
      next();
    };

  const protect = (resource: Resource, action: Action) => [authenticate, requirePasswordChange, authorize(resource, action)];

  return { authenticate, requirePasswordChange, authorize, requireAdminAuthorization, limitAttempts, countAttempt, protect };
}

/** Clave del límite por dirección de origen. */
export const ipKey = (req: Request): string => req.ip ?? req.socket.remoteAddress ?? 'desconocida';
