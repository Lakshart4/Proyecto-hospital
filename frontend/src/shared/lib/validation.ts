// Validación de formularios con zod y asignación de errores de la API a los campos (Req. 3.1, 3.2, 3.5, 3.8).
//
// - Se valida al enviar, de forma síncrona: los errores por campo aparecen de inmediato (≤ 500 ms) y,
//   si hay alguno, el formulario no envía nada y conserva sus valores.
// - Los esquemas no transforman los valores: `.trim()` solo se usa para detectar campos vacíos o con solo
//   espacios; lo que se envía al Backend es exactamente lo que escribió el usuario. Esto es obligatorio
//   en las contraseñas.
// - El Backend vuelve a validar todo (Req. 3.3); aquí solo se replican las reglas que el usuario debe
//   conocer antes de enviar.

import { z } from 'zod';
import { ApiError, type ApiFieldError } from './apiClient';
import { MESSAGES } from './messages';

/** Igual que el Backend (`backend/src/lib/password.ts`). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const isBlank = (value: string): boolean => value.trim().length === 0;

const textType = (message: string) => z.string({ error: message });

/** Texto obligatorio que no puede estar vacío ni tener solo espacios; `max` cuenta `String.length`. */
export function requiredText(max?: number) {
  const base = textType(MESSAGES.validation.required).refine((value) => !isBlank(value), {
    error: MESSAGES.validation.required,
    abort: true,
  });
  return max === undefined
    ? base
    : base.refine((value) => value.length <= max, { error: MESSAGES.validation.tooLong(max) });
}

/** Contraseña actual (login, cambio de contraseña, Autorización_Administrativa): solo obligatoria. */
export function currentPasswordField() {
  return textType(MESSAGES.validation.passwordRequired).refine((value) => !isBlank(value), {
    error: MESSAGES.validation.passwordRequired,
  });
}

/** Contraseña nueva: no vacía ni solo espacios y de 8 a 128 caracteres según `String.length`. */
export function newPasswordField() {
  return textType(MESSAGES.validation.passwordRequired)
    .refine((value) => !isBlank(value), { error: MESSAGES.validation.passwordRequired, abort: true })
    .refine((value) => value.length >= PASSWORD_MIN_LENGTH && value.length <= PASSWORD_MAX_LENGTH, {
      error: MESSAGES.validation.newPasswordLength(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH),
    });
}

/** Cuerpo de `POST /admin-authorization`. */
export const adminAuthorizationSchema = z.object({ password: currentPasswordField() });
export type AdminAuthorizationInput = z.infer<typeof adminAuthorizationSchema>;

export const EMAIL_MAX_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo obligatorio con forma `nombre@dominio.tld`; se comprueba sin los espacios de los extremos y no se transforma. */
export function emailField() {
  return textType(MESSAGES.validation.required)
    .refine((value) => !isBlank(value), { error: MESSAGES.validation.required, abort: true })
    .refine((value) => value.length <= EMAIL_MAX_LENGTH, { error: MESSAGES.validation.tooLong(EMAIL_MAX_LENGTH), abort: true })
    .refine((value) => EMAIL_PATTERN.test(value.trim()), { error: MESSAGES.validation.invalidEmail });
}

/** La confirmación debe ser idéntica, carácter por carácter, a la contraseña nueva. */
const confirmationMatches = (values: { newPassword: string; confirmPassword: string }) => values.newPassword === values.confirmPassword;
const CONFIRMATION_ISSUE = { error: MESSAGES.auth.passwordsDoNotMatch, path: ['confirmPassword'] };

/** Formulario de `POST /auth/login`. */
export const loginSchema = z.object({ email: emailField(), password: currentPasswordField() });
export type LoginInput = z.infer<typeof loginSchema>;

/** Formulario de `POST /auth/forgot-password`. */
export const forgotPasswordSchema = z.object({ email: emailField() });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/** Formulario de `POST /auth/reset-password` (el token llega en la URL, no en el formulario). */
export const resetPasswordSchema = z
  .object({ newPassword: newPasswordField(), confirmPassword: z.string() })
  .refine(confirmationMatches, CONFIRMATION_ISSUE);
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Formulario de `POST /auth/change-password`. */
export const changePasswordSchema = z
  .object({ currentPassword: currentPasswordField(), newPassword: newPasswordField(), confirmPassword: z.string() })
  .refine(confirmationMatches, CONFIRMATION_ISSUE);
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// ---------- Validación al enviar ----------

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

type FieldKey<S extends z.ZodType> = Extract<keyof z.input<S>, string>;

export type ValidationResult<S extends z.ZodType> =
  | { ok: true; data: z.output<S> }
  | { ok: false; fieldErrors: FieldErrors<FieldKey<S>> };

/** Valida los valores del formulario; devuelve el primer mensaje de cada campo con error. */
export function validateForm<S extends z.ZodType>(schema: S, values: z.input<S>): ValidationResult<S> {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: FieldErrors<FieldKey<S>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key !== 'string') continue;
    const field = key as FieldKey<S>; // la ruta de un issue de un objeto es una de sus claves
    if (fieldErrors[field] === undefined) fieldErrors[field] = issue.message;
  }
  return { ok: false, fieldErrors };
}

// ---------- Errores de la API en el formulario ----------

export interface FormErrorState<K extends string> {
  /** Mensajes junto a cada campo. */
  fieldErrors: FieldErrors<K>;
  /** Mensaje general (por ejemplo, en un `ErrorBanner`); `null` si todo quedó junto a los campos. */
  formError: string | null;
}

export interface MapApiErrorOptions<K extends string> {
  /** Campo que recibe el mensaje de un 409; por defecto `internalId` si el formulario lo tiene (Req. 3.8). */
  conflictField?: K;
}

/**
 * Traduce un error de la API al estado de errores del formulario (Req. 3.5, 3.8, 15.12):
 * - 400 con `errors[]`: cada mensaje junto a su campo; los campos que el formulario no tiene van al mensaje general.
 * - 409: el mensaje junto al campo de conflicto (`internalId`), o como mensaje general si no existe.
 * - Cualquier otro error (red, tiempo agotado, Sesión, permisos, servidor): solo el mensaje general en
 *   español del `ApiError`; un error que no es `ApiError` produce un mensaje genérico sin detalles.
 */
export function mapApiError<K extends string>(
  error: unknown,
  fields: readonly K[],
  options: MapApiErrorOptions<K> = {},
): FormErrorState<K> {
  if (!(error instanceof ApiError)) return { fieldErrors: {}, formError: MESSAGES.api.unexpected };

  if (error.kind === 'http' && error.status === 400) {
    const fieldErrors: FieldErrors<K> = {};
    const unmatched: ApiFieldError[] = [];
    for (const item of error.errors) {
      const field = fields.find((f) => f === item.field);
      if (field === undefined) unmatched.push(item);
      else if (fieldErrors[field] === undefined) fieldErrors[field] = item.message;
    }
    const allMatched = error.errors.length > 0 && unmatched.length === 0;
    return { fieldErrors, formError: allMatched ? null : error.message };
  }

  if (error.kind === 'http' && error.status === 409) {
    const conflictField = options.conflictField ?? fields.find((f) => f === 'internalId');
    if (conflictField !== undefined) {
      const fieldErrors: FieldErrors<K> = {};
      fieldErrors[conflictField] = error.message;
      return { fieldErrors, formError: null };
    }
  }

  return { fieldErrors: {}, formError: error.message };
}
