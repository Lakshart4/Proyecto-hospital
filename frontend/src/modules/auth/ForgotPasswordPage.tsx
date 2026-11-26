import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { LOGIN_PATH } from '../../app/navigation';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { useFormSubmit } from '../../shared/hooks/useFormSubmit';
import { apiClient } from '../../shared/lib/apiClient';
import { MESSAGES } from '../../shared/lib/messages';
import { forgotPasswordSchema } from '../../shared/lib/validation';
import { AuthInput, AuthShell } from './AuthShell';

const FIELDS = ['email'] as const;

const backLinkClass = 'self-center text-sm font-medium text-primary underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary';

/**
 * Solicitud del enlace de recuperación (Req. 17.1, 17.10). El Backend responde lo mismo exista o no la
 * cuenta; la página muestra siempre el mismo mensaje y no revela nada sobre el correo.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const { fieldErrors, formError, submitting, submit } = useFormSubmit(FIELDS);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submit(forgotPasswordSchema, { email }, async (data) => {
      await apiClient.post<unknown>('/auth/forgot-password', { email: data.email });
      // Mensaje fijo, igual al del Backend, para no depender de la respuesta.
      setDone(MESSAGES.auth.forgotDone);
    });
  };

  return (
    <AuthShell title={MESSAGES.auth.forgotTitle} description={done ? undefined : MESSAGES.auth.forgotDescription}>
      {done ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-status-success-bg px-4 py-3 text-sm text-status-success-fg">
            {done}
          </p>
          <Link to={LOGIN_PATH} className={backLinkClass}>
            {MESSAGES.auth.backToLogin}
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {formError && <ErrorBanner message={formError} />}
          <AuthInput
            id="forgot-email"
            label={MESSAGES.auth.email}
            type="email"
            autoComplete="email"
            value={email}
            onValueChange={setEmail}
            error={fieldErrors.email}
            disabled={submitting}
          />
          <Button type="submit" loading={submitting} className="w-full">
            {MESSAGES.auth.forgotSubmit}
          </Button>
          <Link to={LOGIN_PATH} className={backLinkClass}>
            {MESSAGES.auth.backToLogin}
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
