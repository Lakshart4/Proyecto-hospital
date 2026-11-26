import type { InputHTMLAttributes, ReactNode } from 'react';
import { DEFAULT_AVATAR_SRC } from '../../shared/components/Avatar';
import { FormField, INPUT_CLASSES } from '../../shared/components/FormField';
import { MESSAGES } from '../../shared/lib/messages';

/** Marco de las páginas de acceso: ilustración ficticia local (Req. 15.8), nombre del sistema y tarjeta. */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img
            src={DEFAULT_AVATAR_SRC}
            alt={MESSAGES.auth.illustrationAlt}
            className="h-24 w-24 rounded-full border border-border bg-active object-cover"
          />
          <p className="text-base font-semibold text-heading">{MESSAGES.app.name}</p>
          <h1 className="text-2xl font-bold text-heading">{title}</h1>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        <div className="rounded-lg border border-border bg-page p-5 shadow-sm sm:p-6">{children}</div>
      </div>
    </main>
  );
}

export interface AuthInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'value' | 'onChange'> {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  error?: string | undefined;
  hint?: string;
}

/** Campo de texto con etiqueta visible y error junto al campo. El valor se guarda tal como se escribe. */
export function AuthInput({ id, label, value, onValueChange, error, hint, ...inputProps }: AuthInputProps) {
  const field = (
    <input value={value} onChange={(event) => onValueChange(event.target.value)} className={INPUT_CLASSES} {...inputProps} />
  );
  return (
    <FormField id={id} label={label} error={error} hint={hint} required>
      {field}
    </FormField>
  );
}
