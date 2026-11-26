import type { LucideIcon } from 'lucide-react';

export interface StatCardProps {
  label: string;
  value: number | string;
  /** Ícono médico de lucide-react (Req. 15.6). */
  icon: LucideIcon;
}

/** Tarjeta de estadística con ícono (Req. 4.1, 15.6). */
export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <article className="flex items-center gap-4 rounded-xl border border-border bg-page p-4 shadow-sm transition-shadow duration-200 hover:shadow-md">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-active text-heading">
        <Icon aria-hidden="true" className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted">{label}</p>
        <p className="text-2xl font-semibold text-ink">{value}</p>
      </div>
    </article>
  );
}
