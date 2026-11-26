import { useId, useState, type FormEvent } from 'react';
import type { AdminAuthDialogBinding } from '../hooks/useAdminAuth';
import { MESSAGES } from '../lib/messages';
import { adminAuthorizationSchema, validateForm } from '../lib/validation';
import { Button } from './Button';
import { ErrorBanner } from './ErrorBanner';
import { FormField, INPUT_CLASSES } from './FormField';
import { Modal } from './Modal';
import { Toast } from './Toast';

export type AdminAuthDialogProps = AdminAuthDialogBinding;

const NOTICE_DURATION_MS = 5000;

/**
 * Diálogo que solicita la contraseña del Administrador (Req. 18.9). Se usa con `useAdminAuth`:
 * `<AdminAuthDialog {...adminAuth.dialog} />`. No se puede cerrar mientras se envía la contraseña.
 */
export function AdminAuthDialog({ open, submitting, error, onSubmit, onCancel, notice, onNoticeClose }: AdminAuthDialogProps) {
  const formId = useId();
  const close = () => {
    if (!submitting) onCancel();
  };

  return (
    <>
      <Modal
        open={open}
        title={MESSAGES.adminAuth.title}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              {MESSAGES.common.cancel}
            </Button>
            <Button type="submit" form={formId} loading={submitting}>
              {MESSAGES.adminAuth.submit}
            </Button>
          </>
        }
      >
        {/* El formulario se desmonta al cerrar el diálogo, así la contraseña no queda en memoria. */}
        <AdminAuthForm formId={formId} submitting={submitting} error={error} onSubmit={onSubmit} />
      </Modal>
      {notice && <Toast message={notice} tone="success" durationMs={NOTICE_DURATION_MS} onClose={onNoticeClose} />}
    </>
  );
}

interface AdminAuthFormProps {
  formId: string;
  submitting: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
}

function AdminAuthForm({ formId, submitting, error, onSubmit }: AdminAuthFormProps) {
  const inputId = useId();
  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const result = validateForm(adminAuthorizationSchema, { password });
    if (!result.ok) {
      setFieldError(result.fieldErrors.password);
      return;
    }
    setFieldError(undefined);
    // Se envía exactamente lo escrito: el esquema no recorta ni transforma la contraseña.
    onSubmit(result.data.password);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <p className="text-muted">{MESSAGES.adminAuth.description}</p>
      {error && <ErrorBanner message={error} />}
      <FormField id={inputId} label={MESSAGES.adminAuth.passwordLabel} error={fieldError} required>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          disabled={submitting}
          className={INPUT_CLASSES}
        />
      </FormField>
    </form>
  );
}
