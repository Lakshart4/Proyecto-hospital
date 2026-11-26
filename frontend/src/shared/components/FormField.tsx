import { cloneElement, isValidElement, type ReactElement } from 'react';

export interface FormFieldProps {
  /** id del control; enlaza la etiqueta y el mensaje de error. */
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  required?: boolean;
  /** Control del formulario (input, select o textarea). */
  children: ReactElement<Record<string, unknown>>;
}

/** Etiqueta visible, control y error junto al campo (Req. 3.2, 3.5). */
export function FormField({ id, label, error, hint, required = false, children }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
      })
    : children;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
        {required && <span aria-hidden="true" className="text-status-danger-fg"> *</span>}
      </label>
      {control}
      {hint && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-status-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}

/** Clases comunes de los controles de texto. */
export const INPUT_CLASSES =
  'min-h-11 w-full rounded-lg border border-slate-300 bg-page px-3.5 py-2.5 text-sm text-ink shadow-sm outline-none transition placeholder:text-slate-400 focus:border-accent focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 aria-[invalid=true]:border-status-danger-fg';
