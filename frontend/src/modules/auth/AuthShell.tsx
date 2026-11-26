import type { InputHTMLAttributes, ReactNode } from 'react';
import { CalendarCheck, Hospital, LockKeyhole, ShieldCheck } from 'lucide-react';
import { DEFAULT_AVATAR_SRC } from '../../shared/components/Avatar';
import { FormField, INPUT_CLASSES } from '../../shared/components/FormField';
import { MESSAGES } from '../../shared/lib/messages';

const HIGHLIGHTS = [
  { icon: ShieldCheck, text: 'Acceso protegido por rol y sesión' },
  { icon: CalendarCheck, text: 'Agenda, pacientes e inventario en un solo lugar' },
  { icon: LockKeyhole, text: 'Registro de auditoría de las operaciones' },
] as const;

/** Marco de las páginas de acceso: panel institucional y tarjeta del formulario. */
export function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen bg-slate-50 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-gradient-to-br from-heading via-primary to-accent p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl"
        />
        <div className="relative flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Hospital aria-hidden="true" className="h-6 w-6" />
          </span>
          <div>
            <p className="text-base font-bold tracking-tight">{MESSAGES.app.name}</p>
            <p className="text-xs font-medium text-white/80">Administración hospitalaria</p>
          </div>
        </div>

        <div className="relative flex flex-col items-start gap-8">
          <img
            src={DEFAULT_AVATAR_SRC}
            alt={MESSAGES.auth.illustrationAlt}
            className="h-40 w-40 rounded-2xl border border-white/25 bg-white/10 object-cover shadow-2xl"
          />
          <div>
            <h2 className="max-w-md text-3xl font-bold leading-tight tracking-tight">
              Gestión clínica y administrativa con trazabilidad.
            </h2>
            <ul className="mt-6 flex flex-col gap-3">
              {HIGHLIGHTS.map((item) => (
                <li key={item.text} className="flex items-center gap-3 text-sm text-white/90">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15">
                    <item.icon aria-hidden="true" className="h-4 w-4" />
                  </span>
                  {item.text}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="relative text-xs text-white/70">Sistema interno de uso institucional.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-heading to-accent text-white shadow-sm">
              <Hospital aria-hidden="true" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-base font-bold tracking-tight text-heading">{MESSAGES.app.name}</p>
              <p className="text-xs font-medium text-muted">Administración hospitalaria</p>
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-page p-6 shadow-lg shadow-slate-900/5 sm:p-8">
            <h1 className="text-2xl font-bold tracking-tight text-heading">{title}</h1>
            {description && <p className="mt-2 text-sm text-muted">{description}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </section>
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
