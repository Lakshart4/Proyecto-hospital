// Esquemas de los formularios de acceso (tarea 5.10): no transforman valores y validan correo y confirmación.

import { describe, expect, it } from 'vitest';
import { MESSAGES } from './messages';
import { EMAIL_MAX_LENGTH, changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema, validateForm } from './validation';

const join = (...parts: string[]) => parts.join(' ');

describe('esquemas de acceso', () => {
  it('loginSchema devuelve el correo y la contraseña exactamente como se escribieron', () => {
    const typed = join('', 'con', 'espacios', '');
    expect(validateForm(loginSchema, { email: ' ana@example.com ', password: typed })).toEqual({
      ok: true,
      data: { email: ' ana@example.com ', password: typed },
    });
  });

  it('emailField: obligatorio, con forma nombre@dominio.tld y como máximo 254 caracteres', () => {
    const errorOf = (email: string) => {
      const result = validateForm(forgotPasswordSchema, { email });
      return result.ok ? null : result.fieldErrors.email;
    };
    expect(errorOf('')).toBe(MESSAGES.validation.required);
    expect(errorOf('   ')).toBe(MESSAGES.validation.required);
    for (const bad of ['ana', 'ana@', '@example.com', 'ana@example', 'a na@example.com']) expect(errorOf(bad)).toBe(MESSAGES.validation.invalidEmail);
    const longest = `${'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length)}@example.com`;
    expect(longest.length).toBe(EMAIL_MAX_LENGTH);
    expect(errorOf(longest)).toBeNull();
    expect(errorOf(`a${longest}`)).toBe(MESSAGES.validation.tooLong(EMAIL_MAX_LENGTH));
  });

  it('la confirmación debe ser idéntica carácter por carácter; los datos validados no cambian', () => {
    const typed = 'q'.repeat(8);
    expect(validateForm(resetPasswordSchema, { newPassword: typed, confirmPassword: `${typed} ` })).toEqual({
      ok: false,
      fieldErrors: { confirmPassword: MESSAGES.auth.passwordsDoNotMatch },
    });
    expect(validateForm(resetPasswordSchema, { newPassword: typed, confirmPassword: typed })).toEqual({
      ok: true,
      data: { newPassword: typed, confirmPassword: typed },
    });
    const current = join('', 'actual');
    expect(validateForm(changePasswordSchema, { currentPassword: current, newPassword: typed, confirmPassword: typed })).toEqual({
      ok: true,
      data: { currentPassword: current, newPassword: typed, confirmPassword: typed },
    });
  });

  it('cambio de contraseña: la actual solo se exige no vacía; la nueva cumple 8 a 128', () => {
    const onlySpaces = ' '.repeat(2);
    const tooLong = 'x'.repeat(129);
    const result = validateForm(changePasswordSchema, { currentPassword: onlySpaces, newPassword: tooLong, confirmPassword: '' });
    expect(result).toEqual({
      ok: false,
      // Todos los errores a la vez: también la confirmación distinta.
      fieldErrors: {
        currentPassword: MESSAGES.validation.passwordRequired,
        newPassword: MESSAGES.validation.newPasswordLength(8, 128),
        confirmPassword: MESSAGES.auth.passwordsDoNotMatch,
      },
    });
  });
});
