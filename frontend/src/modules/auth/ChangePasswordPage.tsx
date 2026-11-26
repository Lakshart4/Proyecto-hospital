import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { homeFor } from '../../app/navigation';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { useAuth } from '../../shared/hooks/useAuth';
import { useFormSubmit } from '../../shared/hooks/useFormSubmit';
import { apiClient } from '../../shared/lib/apiClient';
import { MESSAGES } from '../../shared/lib/messages';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, changePasswordSchema } from '../../shared/lib/validation';
import { AuthInput } from './AuthShell';

const FIELDS = ['currentPassword', 'newPassword', 'confirmPassword'] as const;
const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

/**
 * Cambio de contraseña, obligatorio (cuenta nueva con `mustChangePassword`) o voluntario (Req. 1.8, 1.9, 5.12).
 * Mientras es obligatorio, `ProtectedRoute` no deja abrir otra ruta y el Layout no muestra el menú.
 * Tras un cambio obligatorio se va a la página de inicio del rol.
 */
export function ChangePasswordPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [values, setValues] = useState(EMPTY);
  const [done, setDone] = useState(false);
  const { fieldErrors, formError, submitting, submit } = useFormSubmit(FIELDS);
  const required = user?.mustChangePassword === true;

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setDone(false);
    void submit(changePasswordSchema, values, async (data) => {
      await apiClient.post<unknown>('/auth/change-password', { currentPassword: data.currentPassword, newPassword: data.newPassword });
      setValues(EMPTY);
      setDone(true);
      if (required && user) {
        updateUser({ mustChangePassword: false });
        navigate(homeFor(user.role), { replace: true });
      }
    });
  };

  const set = (key: keyof typeof EMPTY) => (value: string) => setValues((v) => ({ ...v, [key]: value }));

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4">
      <h1 className="text-2xl font-semibold text-heading">{MESSAGES.auth.changeTitle}</h1>
      {required && <p className="rounded-md bg-status-warning-bg px-4 py-3 text-sm text-status-warning-fg">{MESSAGES.auth.changeRequired}</p>}
      {done && (
        <p role="status" className="rounded-md bg-status-success-bg px-4 py-3 text-sm text-status-success-fg">
          {MESSAGES.auth.changeDone}
        </p>
      )}
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 rounded-lg border border-border p-5">
        {formError && <ErrorBanner message={formError} />}
        <AuthInput
          id="change-current-password"
          label={MESSAGES.auth.currentPasswordLabel}
          type="password"
          autoComplete="current-password"
          value={values.currentPassword}
          onValueChange={set('currentPassword')}
          error={fieldErrors.currentPassword}
          disabled={submitting}
        />
        <AuthInput
          id="change-new-password"
          label={MESSAGES.auth.newPasswordLabel}
          type="password"
          autoComplete="new-password"
          hint={MESSAGES.auth.passwordHint(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)}
          value={values.newPassword}
          onValueChange={set('newPassword')}
          error={fieldErrors.newPassword}
          disabled={submitting}
        />
        <AuthInput
          id="change-confirm-password"
          label={MESSAGES.auth.confirmPassword}
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onValueChange={set('confirmPassword')}
          error={fieldErrors.confirmPassword}
          disabled={submitting}
        />
        <Button type="submit" loading={submitting} className="w-full sm:w-auto sm:self-end">
          {MESSAGES.auth.changeSubmit}
        </Button>
      </form>
    </section>
  );
}
