import { MESSAGES } from '../lib/messages';

export interface ProgressBarProps {
  label: string;
  /** Porcentaje de 0 a 100; los valores fuera de rango se ajustan. */
  value: number;
}

/** Barra de progreso con el valor numérico en texto (Req. 4.10). */
export function ProgressBar({ label, value }: ProgressBarProps) {
  const percent = Math.min(100, Math.max(0, Math.round(Number.isFinite(value) ? value : 0)));
  const text = MESSAGES.progress.percent(percent);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm text-ink">
        <span>{label}</span>
        <span className="font-medium">{text}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={text} className="h-2.5 w-full overflow-hidden rounded-full bg-status-neutral-bg">
        <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
