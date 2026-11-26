import { MESSAGES } from '../lib/messages';

export interface SpinnerProps {
  /** Texto para lectores de pantalla (por defecto, "Cargando…"). */
  label?: string;
  size?: 'sm' | 'md';
}

/** Indicador de carga accesible (Req. 15.11). */
export function Spinner({ label = MESSAGES.common.loading, size = 'md' }: SpinnerProps) {
  const dimension = size === 'sm' ? 'h-4 w-4 border-2' : 'h-6 w-6 border-[3px]';
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center">
      <span aria-hidden="true" className={`${dimension} animate-spin rounded-full border-current border-t-transparent`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
