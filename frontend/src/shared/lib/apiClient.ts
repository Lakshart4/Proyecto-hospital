// Cliente HTTP único del Frontend (Req. 13.5, 15.12, 4.6, 18.9).
//
// - Todas las solicitudes van a `/api` con `credentials: 'include'` para enviar la cookie de Sesión.
// - Toda respuesta no exitosa, error de red o tiempo agotado se convierte en `ApiError`, con un mensaje
//   en español apto para mostrarse; nunca se exponen trazas ni detalles internos y no se escribe en consola.
// - Un 401 limpia al usuario y lleva a `/login` mediante el manejador configurable, salvo en las
//   solicitudes que lo suprimen: login, recuperación de contraseña y `POST /admin-authorization`.
//   En esta última un 401 puede ser una contraseña incorrecta; `useAdminAuth` lo distingue con `/auth/me`.

import { MESSAGES } from './messages';

export const API_PREFIX = '/api';
/** Tiempo máximo por defecto de una solicitud. */
export const DEFAULT_TIMEOUT_MS = 30_000;
/** Tiempo máximo del dashboard (Req. 4.6). */
export const DASHBOARD_TIMEOUT_MS = 10_000;
export const LOGIN_PATH = '/login';

/** Códigos de error que devuelve el Backend (`backend/src/lib/errors.ts`). */
export const API_ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'PASSWORD_CHANGE_REQUIRED',
  'AUTORIZACION_ADMIN_REQUERIDA',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'INTERNAL_ERROR',
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Origen del error. `http`: el Backend respondió con un estado no exitoso. `network`: no hubo respuesta.
 * `timeout`: se superó el tiempo máximo. `aborted`: el llamador canceló la solicitud.
 * `invalid_response`: respuesta exitosa con un cuerpo que no es JSON. `unknown`: cualquier otro error.
 */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'aborted' | 'invalid_response' | 'unknown';

export interface ApiFieldError {
  field: string;
  message: string;
}

export interface ApiErrorInit {
  kind: ApiErrorKind;
  /** Estado HTTP; 0 si no hubo respuesta. */
  status: number;
  /** Código del Backend; `null` si la respuesta no lo incluye o no hubo respuesta. */
  code: ApiErrorCode | null;
  message: string;
  errors?: ApiFieldError[];
}

/** Error tipado de la API. `message` siempre está en español y puede mostrarse al usuario. */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number;
  readonly code: ApiErrorCode | null;
  readonly errors: ApiFieldError[];

  constructor(init: ApiErrorInit) {
    super(init.message);
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status;
    this.code = init.code;
    this.errors = init.errors ?? [];
  }
}

/** Categoría para decidir cómo mostrar el error. */
export type ApiErrorCategory =
  | 'validation'
  | 'conflict'
  | 'unauthenticated'
  | 'forbidden'
  | 'admin_auth_required'
  | 'password_change_required'
  | 'not_found'
  | 'rate_limited'
  | 'server'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'unknown';

export function errorCategory(error: ApiError): ApiErrorCategory {
  switch (error.kind) {
    case 'network':
      return 'network';
    case 'timeout':
      return 'timeout';
    case 'aborted':
      return 'aborted';
    case 'invalid_response':
      return 'server';
    case 'unknown':
      return 'unknown';
    case 'http':
      break;
  }
  if (error.code === 'AUTORIZACION_ADMIN_REQUERIDA') return 'admin_auth_required';
  if (error.code === 'PASSWORD_CHANGE_REQUIRED') return 'password_change_required';
  if (error.status === 400) return 'validation';
  if (error.status === 401) return 'unauthenticated';
  if (error.status === 403) return 'forbidden';
  if (error.status === 404) return 'not_found';
  if (error.status === 409) return 'conflict';
  if (error.status === 429) return 'rate_limited';
  if (error.status >= 500) return 'server';
  return 'unknown';
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** El Backend pide una Autorización_Administrativa vigente (Req. 18.5, 18.9). */
export function isAdminAuthRequired(error: unknown): error is ApiError {
  return error instanceof ApiError && error.code === 'AUTORIZACION_ADMIN_REQUERIDA';
}

/** Convierte cualquier valor lanzado en `ApiError` sin exponer su contenido. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError({ kind: 'unknown', status: 0, code: null, message: MESSAGES.api.unexpected });
}

// ---------- Configuración ----------

export type UnauthenticatedHandler = () => void;

/**
 * Manejador por defecto: navegación completa a `/login`, que además descarta el usuario en memoria.
 * El AuthContext puede reemplazarlo con `configureApiClient` para limpiar el usuario y navegar sin recargar.
 */
export function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== LOGIN_PATH) window.location.assign(LOGIN_PATH);
}

let unauthenticatedHandler: UnauthenticatedHandler = redirectToLogin;

export interface ApiClientConfig {
  onUnauthenticated?: UnauthenticatedHandler;
}

export function configureApiClient(config: ApiClientConfig): void {
  if (config.onUnauthenticated) unauthenticatedHandler = config.onUnauthenticated;
}

export function resetApiClientConfig(): void {
  unauthenticatedHandler = redirectToLogin;
}

// ---------- Solicitudes ----------

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  /** Cuerpo JSON (se serializa sin modificar sus valores) o `FormData` para cargas multipart. */
  body?: unknown;
  signal?: AbortSignal;
  /** Tiempo máximo en milisegundos; 0 lo desactiva. */
  timeoutMs?: number;
  /** Evita la redirección a `/login` ante un 401 (además de las rutas exentas fijas). */
  skipAuthRedirect?: boolean;
}

/** Solicitudes en las que un 401 no significa necesariamente que la Sesión expiró. */
const AUTH_REDIRECT_EXEMPT: ReadonlyArray<readonly [HttpMethod, string]> = [
  ['POST', '/auth/login'],
  ['POST', '/auth/forgot-password'],
  ['POST', '/auth/reset-password'],
  ['POST', '/admin-authorization'],
];

export function isAuthRedirectExempt(method: HttpMethod, path: string): boolean {
  const pathname = path.split('?')[0];
  return AUTH_REDIRECT_EXEMPT.some(([m, p]) => m === method && p === pathname);
}

/** Solo rutas relativas a `/api`: así la cookie de Sesión nunca viaja a otro origen. */
function buildUrl(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith(`${API_PREFIX}/`)) {
    throw new TypeError('La ruta de la API debe empezar con "/" y no incluir el prefijo /api.');
  }
  return `${API_PREFIX}${path}`;
}

function fallbackMessage(status: number): string {
  if (status === 400) return MESSAGES.api.invalidData;
  if (status === 401) return MESSAGES.api.unauthenticated;
  if (status === 403) return MESSAGES.api.forbidden;
  if (status === 404) return MESSAGES.api.notFound;
  if (status === 409) return MESSAGES.api.conflict;
  if (status === 429) return MESSAGES.api.tooManyRequests;
  if (status >= 500) return MESSAGES.api.server;
  return MESSAGES.api.unexpected;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === 'string' && (API_ERROR_CODES as readonly string[]).includes(value);
}

function parseFieldErrors(value: unknown): ApiFieldError[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) =>
    isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string'
      ? [{ field: item.field, message: item.message }]
      : [],
  );
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/**
 * Error de una respuesta no exitosa. Se usa el mensaje del Backend solo si el cuerpo tiene su formato
 * `{ code, message, errors? }`; en errores 5xx únicamente el mensaje genérico de `INTERNAL_ERROR`.
 */
function errorFromResponse(status: number, text: string): ApiError {
  const parsed = text.trim() === '' ? { ok: false as const } : parseJson(text);
  const body = parsed.ok && isRecord(parsed.value) ? parsed.value : null;
  const code = body && isApiErrorCode(body.code) ? body.code : null;
  const backendMessage = body && code && typeof body.message === 'string' && body.message.trim() !== '' ? body.message : null;
  const trustMessage = backendMessage !== null && (status < 500 || code === 'INTERNAL_ERROR');
  return new ApiError({
    kind: 'http',
    status,
    code,
    message: trustMessage ? backendMessage : fallbackMessage(status),
    errors: status === 400 && body ? parseFieldErrors(body.errors) : [],
  });
}

/**
 * Envía una solicitud a la API y devuelve el cuerpo JSON (o `undefined` si la respuesta no tiene cuerpo).
 * El tipo `T` lo declara el llamador según el contrato del endpoint; la API es propia y conocida.
 * @throws ApiError ante cualquier fallo.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  const url = buildUrl(path);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  // Un controlador propio combina la cancelación del llamador con el tiempo máximo.
  const controller = new AbortController();
  let timedOut = false;
  const callerSignal = options.signal;
  const onCallerAbort = () => controller.abort();
  if (callerSignal?.aborted) controller.abort();
  else callerSignal?.addEventListener('abort', onCallerAbort, { once: true });
  const timer = timeoutMs > 0 ? setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs) : undefined;

  const abortError = (): ApiError =>
    timedOut
      ? new ApiError({ kind: 'timeout', status: 0, code: null, message: MESSAGES.api.timeout })
      : new ApiError({ kind: 'aborted', status: 0, code: null, message: MESSAGES.api.unexpected });

  try {
    let response: Response;
    let text: string;
    try {
      const init: RequestInit = { method, headers, credentials: 'include', signal: controller.signal };
      if (body !== undefined) init.body = body;
      response = await fetch(url, init);
      text = await response.text();
    } catch {
      if (controller.signal.aborted) throw abortError();
      throw new ApiError({ kind: 'network', status: 0, code: null, message: MESSAGES.api.network });
    }

    if (!response.ok) {
      const error = errorFromResponse(response.status, text);
      if (response.status === 401 && !options.skipAuthRedirect && !isAuthRedirectExempt(method, path)) {
        unauthenticatedHandler();
      }
      throw error;
    }

    if (text.trim() === '') return undefined as T;
    const parsed = parseJson(text);
    if (!parsed.ok) {
      throw new ApiError({ kind: 'invalid_response', status: response.status, code: null, message: MESSAGES.api.invalidResponse });
    }
    return parsed.value as T;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    callerSignal?.removeEventListener('abort', onCallerAbort);
  }
}

type NoMethod = Omit<RequestOptions, 'method' | 'body'>;

/** Atajos por método. */
export const apiClient = {
  get: <T>(path: string, options?: NoMethod) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: NoMethod) => request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: NoMethod) => request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: NoMethod) => request<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T = void>(path: string, options?: NoMethod) => request<T>(path, { ...options, method: 'DELETE' }),
};
