import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FORGOT_PASSWORD_PATH, LOGIN_PATH } from '../../app/navigation';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { useAuth } from '../../shared/hooks/useAuth';
import { useFormSubmit } from '../../shared/hooks/useFormSubmit';
import { apiClient } from '../../shared/lib/apiClient';
import { MESSAGES } from '../../shared/lib/messages';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, resetPasswordSchema } from '../../shared/lib/validation';
import { AuthInput, AuthShell } from './AuthShell';

const FIELDS = ['newPassword', 'confirmPassword'] as const;
const linkClass = 'self-center text-sm font-medium text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Nueva contraseña con el enlace de recuperación (Req. 17.5–17.7, 17.10). El token se lee de `?token=`
 * y solo se envía al Backend; no se guarda. La contraseña se envía exactamente como se escribió.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { clearUser } = useAuth();
  const [values, setValues] = useState({ newPassword: '', confirmPassword: '' });
  const [done, setDone] = useState(false);
  const { fieldErrors, formError, submitting, submit } = useFormSubmit(FIELDS);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(resetPasswordSchema, values, async (data) => {
      await apiClient.post<unknown>('/auth/reset-password', { token, newPassword: data.newPassword });
      // El Backend cerró todas las Sesiones de la cuenta.
      clearUser();
      setDone(true);
    });
  };

  if (token.trim() === '') {
    return (
      <AuthShell title={MESSAGES.auth.resetTitle}>
        <div className="flex flex-col gap-4">
          <ErrorBanner message={MESSAGES.auth.invalidResetLink} />
          <Link to={FORGOT_PASSWORD_PATH} className={linkClass}>
            {MESSAGES.auth.requestNewLink}
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell title={MESSAGES.auth.resetTitle}>
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-status-success-bg px-4 py-3 text-sm text-status-success-fg">
            {MESSAGES.auth.resetDone}
          </p>
          <Link to={LOGIN_PATH} className={linkClass}>
            {MESSAGES.auth.backToLogin}
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={MESSAGES.auth.resetTitle} description={MESSAGES.auth.resetDescription}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <ErrorBanner message={formError} />}
        <AuthInput
          id="reset-new-password"
          label={MESSAGES.auth.newPasswordLabel}
          type="password"
          autoComplete="new-password"
          hint={MESSAGES.auth.passwordHint(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH)}
          value={values.newPassword}
          onValueChange={(newPassword) => setValues((v) => ({ ...v, newPassword }))}
          error={fieldErrors.newPassword}
          disabled={submitting}
        />
        <AuthInput
          id="reset-confirm-password"
          label={MESSAGES.auth.confirmPassword}
          type="password"
          autoComplete="new-password"
          value={values.confirmPassword}
          onValueChange={(confirmPassword) => setValues((v) => ({ ...v, confirmPassword }))}
          error={fieldErrors.confirmPassword}
          disabled={submitting}
        />
        <Button type="submit" loading={submitting} className="w-full">
          {MESSAGES.auth.resetSubmit}
        </Button>
        {formError && (
          <Link to={FORGOT_PASSWORD_PATH} className={linkClass}>
            {MESSAGES.auth.requestNewLink}
          </Link>
        )}
      </form>
    </AuthShell>
  );
}
