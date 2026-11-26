// Esquemas zod del módulo auth (Req. 1, 3.3, 3.4).
// La longitud de la contraseña nueva (8 a 128) la valida lib/password.ts, que también informa la
// contraseña actual incorrecta; aquí solo se exige que los campos sean textos.

import { z } from 'zod';
import { REQUIRED_MESSAGE, TEXT_TYPE_MESSAGE } from './common';

const text = (message = REQUIRED_MESSAGE) =>
  z.string({ error: (issue) => (issue.input === undefined ? REQUIRED_MESSAGE : TEXT_TYPE_MESSAGE) }).min(1, message);

export const loginBodySchema = z.object({
  email: text().transform((value) => value.trim()),
  password: text(),
});

export const forgotPasswordBodySchema = z.object({
  email: text().transform((value) => value.trim()),
});

/** La longitud de la contraseña nueva la valida el servicio (8 a 128) antes de revisar el token. */
export const resetPasswordBodySchema = z.object({
  token: text(),
  newPassword: z.string({ error: (issue) => (issue.input === undefined ? REQUIRED_MESSAGE : TEXT_TYPE_MESSAGE) }),
});

export const adminAuthorizationBodySchema = z.object({
  password: text(),
});

export const changePasswordBodySchema = z.object({
  currentPassword: text(),
  newPassword: z.string({ error: (issue) => (issue.input === undefined ? REQUIRED_MESSAGE : TEXT_TYPE_MESSAGE) }),
});
