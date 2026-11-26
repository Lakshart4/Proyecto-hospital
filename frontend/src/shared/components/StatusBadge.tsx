import { STATUS_TONE_CLASSES, statusTone, type StatusTone } from '../lib/colors';

export interface StatusBadgeProps {
  /** Texto del estado, siempre visible (Req. 15.7). */
  value: string;
  /** Tono explícito; por defecto se deduce del valor. */
  tone?: StatusTone;
}

/** Insignia con color diferenciado y el texto del valor (Req. 15.7). */
export function StatusBadge({ value, tone }: StatusBadgeProps) {
  const resolved = tone ?? statusTone(value);
  return (
    <span data-tone={resolved} className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE_CLASSES[resolved]}`}>
      {value}
    </span>
  );
}
