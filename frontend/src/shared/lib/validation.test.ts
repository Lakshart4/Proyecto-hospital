// Pruebas de validación de formularios y mapeo de errores de la API (tarea 5.11).

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError } from './apiClient';
import { MESSAGES } from './messages';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  adminAuthorizationSchema,
  currentPasswordField,
  mapApiError,
  newPasswordField,
  requiredText,
  validateForm,
} from './validation';

const LENGTH_MESSAGE = MESSAGES.validation.newPasswordLength(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH);

/** Primer mensaje de error de un esquema de campo, o `null` si el valor es válido. */
function firstError(schema: z.ZodType, value: unknown): string | null {
  const result = schema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? null);
}

const httpError = (status: number, message: string, errors: { field: string; message: string }[] = []) =>
  new ApiError({ kind: 'http', status, code: status === 400 ? 'VALIDATION_ERROR' : status === 409 ? 'CONFLICT' : null, message, errors });

describe('newPasswordField', () => {
  it('acepta de 8 a 128 caracteres contados con String.length', () => {
    expect(firstError(newPasswordField(), 'a'.repeat(PASSWORD_MIN_LENGTH))).toBeNull();
    expect(firstError(newPasswordField(), 'a'.repeat(PASSWORD_MAX_LENGTH))).toBeNull();
    expect(firstError(newPasswordField(), 'a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(LENGTH_MESSAGE);
    expect(firstError(newPasswordField(), 'a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(LENGTH_MESSAGE);
  });

  it('cuenta unidades de String.length: un emoji ocupa 2 y los espacios cuentan', () => {
    const emoji = '\u{1F600}';
    expect(emoji.length).toBe(2);
    expect(firstError(newPasswordField(), emoji.repeat(4))).toBeNull();
    expect(firstError(newPasswordField(), `${emoji.repeat(3)}a`)).toBe(LENGTH_MESSAGE);
    expect(firstError(newPasswordField(), ' abcdef ')).toBeNull();
  });

  it('rechaza el texto vacío o solo con espacios (de cualquier longitud) como obligatorio', () => {
    for (const value of ['', ' ', '        ', ' '.repeat(PASSWORD_MAX_LENGTH), '\t\n  ']) {
      expect(firstError(newPasswordField(), value)).toBe(MESSAGES.validation.passwordRequired);
    }
  });

  it('no recorta ni transforma el valor validado', () => {
    const value = `  ${'x'.repeat(10)}  `;
    const result = newPasswordField().safeParse(value);
    expect(result.success && result.data).toBe(value);
  });

  it('un valor que no es texto se rechaza como obligatorio', () => {
    expect(firstError(newPasswordField(), undefined)).toBe(MESSAGES.validation.passwordRequired);
  });
});

describe('currentPasswordField y adminAuthorizationSchema', () => {
  it('solo exige que la contraseña no esté vacía ni tenga solo espacios, sin regla de longitud', () => {
    expect(firstError(currentPasswordField(), 'abc')).toBeNull();
    expect(firstError(currentPasswordField(), '   ')).toBe(MESSAGES.validation.passwordRequired);
    expect(firstError(currentPasswordField(), '')).toBe(MESSAGES.validation.passwordRequired);
  });

  it('devuelve la contraseña exactamente como se escribió', () => {
    const value = ` ${'p'.repeat(9)}\t`;
    const result = validateForm(adminAuthorizationSchema, { password: value });
    expect(result).toEqual({ ok: true, data: { password: value } });
  });
});

describe('requiredText', () => {
  it('rechaza vacío y solo espacios; aplica el máximo con String.length sin recortar', () => {
    const schema = requiredText(5);
    expect(firstError(schema, '')).toBe(MESSAGES.validation.required);
    expect(firstError(schema, '   ')).toBe(MESSAGES.validation.required);
    expect(firstError(schema, 'abcde')).toBeNull();
    expect(firstError(schema, ' abcde')).toBe(MESSAGES.validation.tooLong(5));
    expect(requiredText().safeParse(' a ').data).toBe(' a ');
  });
});

describe('validateForm', () => {
  const schema = z.object({ name: requiredText(10), internalId: requiredText(), note: z.string() });

  it('devuelve el primer error de cada campo y conserva el objeto de valores intacto', () => {
    const values = { name: '   ', internalId: '', note: 'x' };
    const snapshot = { ...values };
    const result = validateForm(schema, values);
    expect(result).toEqual({ ok: false, fieldErrors: { name: MESSAGES.validation.required, internalId: MESSAGES.validation.required } });
    expect(values).toEqual(snapshot);
  });

  it('con datos válidos devuelve los mismos valores', () => {
    expect(validateForm(schema, { name: 'Ana', internalId: 'EMP-1', note: '' })).toEqual({
      ok: true,
      data: { name: 'Ana', internalId: 'EMP-1', note: '' },
    });
  });
});

describe('mapApiError', () => {
  const fields = ['name', 'internalId', 'email'] as const;

  it('400: asigna cada error a su campo (el primero por campo) sin mensaje general si todos coinciden', () => {
    const error = httpError(400, 'Los datos enviados no son válidos.', [
      { field: 'name', message: 'El nombre es obligatorio.' },
      { field: 'name', message: 'Segundo mensaje.' },
      { field: 'email', message: 'El correo no es válido.' },
    ]);
    expect(mapApiError(error, fields)).toEqual({
      fieldErrors: { name: 'El nombre es obligatorio.', email: 'El correo no es válido.' },
      formError: null,
    });
  });

  it('400: los campos que el formulario no tiene, o la falta de errors[], dan el mensaje general', () => {
    const partial = httpError(400, 'Los datos enviados no son válidos.', [
      { field: 'name', message: 'El nombre es obligatorio.' },
      { field: 'departmentId', message: 'El registro indicado no existe.' },
    ]);
    expect(mapApiError(partial, fields)).toEqual({
      fieldErrors: { name: 'El nombre es obligatorio.' },
      formError: 'Los datos enviados no son válidos.',
    });
    expect(mapApiError(httpError(400, 'Los datos enviados no son válidos.'), fields)).toEqual({
      fieldErrors: {},
      formError: 'Los datos enviados no son válidos.',
    });
  });

  it('409: el mensaje va junto a internalId; con conflictField a otro campo; sin el campo, al mensaje general', () => {
    const conflict = httpError(409, 'El ID interno ya existe.');
    expect(mapApiError(conflict, fields)).toEqual({ fieldErrors: { internalId: 'El ID interno ya existe.' }, formError: null });
    const email = httpError(409, 'El correo electrónico ya está registrado.');
    expect(mapApiError(email, fields, { conflictField: 'email' })).toEqual({
      fieldErrors: { email: 'El correo electrónico ya está registrado.' },
      formError: null,
    });
    expect(mapApiError(conflict, ['name'] as const)).toEqual({ fieldErrors: {}, formError: 'El ID interno ya existe.' });
  });

  it('red, tiempo agotado, Sesión, permisos y servidor solo producen el mensaje general', () => {
    const others = [
      new ApiError({ kind: 'network', status: 0, code: null, message: MESSAGES.api.network }),
      new ApiError({ kind: 'timeout', status: 0, code: null, message: MESSAGES.api.timeout }),
      new ApiError({ kind: 'http', status: 401, code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.' }),
      new ApiError({ kind: 'http', status: 403, code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' }),
      new ApiError({ kind: 'http', status: 500, code: 'INTERNAL_ERROR', message: MESSAGES.api.server }),
    ];
    for (const error of others) expect(mapApiError(error, fields)).toEqual({ fieldErrors: {}, formError: error.message });
  });

  it('un error que no es ApiError produce un mensaje genérico sin detalles técnicos', () => {
    const result = mapApiError(new Error('TypeError: x is undefined at Form.tsx:10'), fields);
    expect(result).toEqual({ fieldErrors: {}, formError: MESSAGES.api.unexpected });
  });
});
