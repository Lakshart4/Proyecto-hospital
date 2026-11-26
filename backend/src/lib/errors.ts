// Errores tipados de la aplicación y traducción de errores de Prisma (Req. 3.6, 3.7, 13.4, 13.8, 14.7).
//
// Cada AppError tiene el estado HTTP, el código y un mensaje en español pensados para el cliente.
// `translatePrismaError` convierte los errores conocidos de Prisma según el contexto de la operación.
// `toErrorResponse` produce el cuerpo { code, message, errors? } sin trazas, SQL, rutas ni datos de Prisma.
// Este archivo no importa @prisma/client: reconoce los errores de Prisma por su nombre y código.

export interface FieldError {
  field: string;
  message: string;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'PASSWORD_CHANGE_REQUIRED'
  | 'AUTORIZACION_ADMIN_REQUERIDA'
  | 'NOT_FOUND'
  | 'METHOD_NOT_ALLOWED'
  | 'CONFLICT'
  | 'TOO_MANY_REQUESTS'
  | 'INTERNAL_ERROR';

export const GENERIC_INTERNAL_MESSAGE = 'Ocurrió un error interno. Inténtalo de nuevo más tarde.';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;

  constructor(status: number, code: ErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class ValidationError extends AppError {
  readonly errors: FieldError[];

  constructor(message = 'Los datos enviados no son válidos.', errors: FieldError[] = []) {
    super(400, 'VALIDATION_ERROR', message);
    this.errors = errors;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Debes iniciar sesión para continuar.') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'No tienes permiso para realizar esta acción.') {
    super(403, 'FORBIDDEN', message);
  }
}

export class PasswordChangeRequiredError extends AppError {
  constructor(message = 'Debes cambiar tu contraseña antes de continuar.') {
    super(403, 'PASSWORD_CHANGE_REQUIRED', message);
  }
}

export class AdminAuthorizationRequiredError extends AppError {
  constructor(message = 'Se requiere una autorización administrativa vigente.') {
    super(403, 'AUTORIZACION_ADMIN_REQUERIDA', message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'El registro solicitado no existe.') {
    super(404, 'NOT_FOUND', message);
  }
}

export class MethodNotAllowedError extends AppError {
  constructor(message = 'Esta operación no está permitida sobre este recurso.') {
    super(405, 'METHOD_NOT_ALLOWED', message);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'La operación entra en conflicto con los datos existentes.') {
    super(409, 'CONFLICT', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.') {
    super(429, 'TOO_MANY_REQUESTS', message);
  }
}

export class InternalError extends AppError {
  constructor(message = GENERIC_INTERNAL_MESSAGE) {
    super(500, 'INTERNAL_ERROR', message);
  }
}

// ---------- Errores de Prisma ----------

/** Tipo de operación sobre la base de datos; determina cómo se traduce P2003. */
export type DbOperation = 'create' | 'update' | 'delete' | 'read';

export interface DbErrorContext {
  operation: DbOperation;
  /** Campo de la solicitud que contiene la referencia (para el error 400 de P2003). */
  referenceField?: string;
}

interface PrismaKnownErrorShape {
  code: string;
  meta?: Record<string, unknown>;
}

/** Reconoce un PrismaClientKnownRequestError sin importar @prisma/client. */
export function isPrismaKnownError(error: unknown): error is Error & PrismaKnownErrorShape {
  return (
    error instanceof Error &&
    error.name === 'PrismaClientKnownRequestError' &&
    typeof (error as Partial<PrismaKnownErrorShape>).code === 'string'
  );
}

/** Mensajes de duplicado por campo único conocido. Nunca se repite el valor enviado. */
const DUPLICATE_MESSAGES: Record<string, string> = {
  internalId: 'El ID interno ya existe.',
  email: 'El correo electrónico ya está registrado.',
  number: 'Ya existe una habitación con ese número.',
  date: 'Ya existe un día inhábil en esa fecha.',
  name: 'Ya existe un registro con ese nombre.',
  dayOfWeek: 'Ya existe un horario para ese día.',
  deliveryId: 'La entrega ya tiene un movimiento de inventario registrado.',
};
const DEFAULT_DUPLICATE_MESSAGE = 'Ya existe un registro con esos datos.';

function duplicateMessage(meta: Record<string, unknown> | undefined): string {
  const target = meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : typeof target === 'string' ? [target] : [];
  for (const field of fields) {
    const known = Object.keys(DUPLICATE_MESSAGES).find((name) => field === name || field.includes(`_${name}_`));
    if (known) return DUPLICATE_MESSAGES[known] as string;
  }
  return DEFAULT_DUPLICATE_MESSAGE;
}

/**
 * Traduce un error conocido de Prisma a un AppError según el contexto:
 * - P2002 (único duplicado): 409.
 * - P2003 (clave foránea): 400 al crear o editar (referencia inexistente) y 409 al eliminar
 *   (tiene registros asociados). Sin contexto o en lectura no se traduce.
 * - P2025 (registro no encontrado): 404.
 * Devuelve `null` si el error no es de Prisma o no tiene traducción segura; el llamador
 * debe dejarlo seguir para que termine como 500 genérico.
 */
export function translatePrismaError(error: unknown, context?: DbErrorContext): AppError | null {
  if (!isPrismaKnownError(error)) return null;

  switch (error.code) {
    case 'P2002':
      return new ConflictError(duplicateMessage(error.meta));
    case 'P2025':
      return new NotFoundError();
    case 'P2003': {
      if (context?.operation === 'delete') {
        return new ConflictError('No se puede eliminar porque tiene registros asociados.');
      }
      if (context?.operation === 'create' || context?.operation === 'update') {
        const message = 'Uno de los registros relacionados no existe.';
        const errors = context.referenceField
          ? [{ field: context.referenceField, message: 'El registro indicado no existe.' }]
          : [];
        return new ValidationError(message, errors);
      }
      return null;
    }
    default:
      return null;
  }
}

export interface ErrorResponse {
  status: number;
  body: { code: ErrorCode; message: string; errors?: FieldError[] };
}

/**
 * Convierte cualquier error en la respuesta que recibe el cliente (Req. 13.4, 13.8).
 * Los AppError conservan su estado, código y mensaje; `errors` solo aparece en 400.
 * Cualquier otro error (incluido un error de Prisma sin traducción) se responde como
 * 500 con un mensaje genérico, sin trazas, SQL, rutas ni metadatos.
 */
export function toErrorResponse(error: unknown): ErrorResponse {
  const appError = error instanceof AppError ? error : translatePrismaError(error);

  if (!appError) {
    return { status: 500, body: { code: 'INTERNAL_ERROR', message: GENERIC_INTERNAL_MESSAGE } };
  }

  const body: ErrorResponse['body'] = { code: appError.code, message: appError.message };
  if (appError instanceof ValidationError) {
    body.errors = appError.errors.map(({ field, message }) => ({ field, message }));
  }
  return { status: appError.status, body };
}
