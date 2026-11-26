import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { FORGOT_PASSWORD_PATH } from '../../app/navigation';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { useAuth } from '../../shared/hooks/useAuth';
import { useFormSubmit } from '../../shared/hooks/useFormSubmit';
import { MESSAGES } from '../../shared/lib/messages';
import { loginSchema } from '../../shared/lib/validation';
import { AuthInput, AuthShell } from './AuthShell';

const FIELDS = ['email', 'password'] as const;

/**
 * Inicio de sesión (Req. 1.1, 1.2, 17.10). Credenciales incorrectas muestran el mensaje genérico del
 * Backend sin borrar el formulario. Tras el éxito, `PublicOnlyRoute` lleva al destino del rol, o al cambio
 * de contraseña si es obligatorio.
 */
export function LoginPage() {
  const { login } = useAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const { fieldErrors, formError, submitting, submit } = useFormSubmit(FIELDS);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(loginSchema, values, async (data) => {
      await login(data.email, data.password);
    });
  };

  return (
    <AuthShell title={MESSAGES.auth.loginTitle}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {formError && <ErrorBanner message={formError} />}
        <AuthInput
          id="login-email"
          label={MESSAGES.auth.email}
          type="email"
          autoComplete="username"
          value={values.email}
          onValueChange={(email) => setValues((v) => ({ ...v, email }))}
          error={fieldErrors.email}
          disabled={submitting}
        />
        <AuthInput
          id="login-password"
          label={MESSAGES.auth.passwordLabel}
          type="password"
          autoComplete="current-password"
          value={values.password}
          onValueChange={(password) => setValues((v) => ({ ...v, password }))}
          error={fieldErrors.password}
          disabled={submitting}
        />
        <Button type="submit" loading={submitting} className="w-full">
          {MESSAGES.auth.loginSubmit}
        </Button>
        <Link to={FORGOT_PASSWORD_PATH} className="self-center text-sm font-medium text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          {MESSAGES.auth.forgotLink}
        </Link>
      </form>
    </AuthShell>
  );
}
