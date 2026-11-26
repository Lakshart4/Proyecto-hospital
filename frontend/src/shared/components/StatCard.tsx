import type { LucideIcon } from 'lucide-react';

export type StatCardTone = 'primary' | 'accent' | 'warning' | 'danger' | 'neutral';

export interface StatCardProps {
  label: string;
  value: number | string;
  /** Ícono médico de lucide-react (Req. 4.1, 15.6). */
  icon: LucideIcon;
  /** Acento visual opcional; no altera el significado ni el valor de la métrica. */
  tone?: StatCardTone;
}

const TONE_CLASSES: Record<StatCardTone, { icon: string; bar: string }> = {
  primary: { icon: 'bg-active text-primary', bar: 'bg-primary' },
  accent: { icon: 'bg-status-info-bg text-accent', bar: 'bg-accent' },
  warning: { icon: 'bg-status-warning-bg text-status-warning-fg', bar: 'bg-status-warning-fg' },
  danger: { icon: 'bg-status-danger-bg text-status-danger-fg', bar: 'bg-status-danger-fg' },
  neutral: { icon: 'bg-status-neutral-bg text-status-neutral-fg', bar: 'bg-slate-400' },
};

/** Tarjeta de estadística con ícono y jerarquía visual consistente. */
export function StatCard({ label, value, icon: Icon, tone = 'primary' }: StatCardProps) {
  const classes = TONE_CLASSES[tone];
  return (
    <article className="relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border bg-page p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <span className={`absolute inset-y-0 left-0 w-1 ${classes.bar}`} aria-hidden="true" />
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${classes.icon}`}>
        <Icon aria-hidden="true" className="h-6 w-6" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted">{label}</p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight text-ink">{value}</p>
      </div>
    </article>
  );
}
