import { AlertTriangle, Bell, CalendarClock, Package, Stethoscope, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { Spinner } from '../../shared/components/Spinner';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useApi } from '../../shared/hooks/useApi';
import { formatDateTime } from '../../shared/lib/formatters';
import { listNotifications, type HospitalNotification } from './api';

const icons = { stock: Package, treatment: CalendarClock, equipment: Wrench, delivery: Stethoscope } as const;
const tones = { info: 'info', warning: 'warning', critical: 'danger' } as const;
const labels = { info: 'Informativa', warning: 'Atención', critical: 'Crítica' } as const;

function NotificationCard({ notification }: { notification: HospitalNotification }) {
  const Icon = icons[notification.kind];
  return (
    <article className="flex gap-4 rounded-xl border border-border bg-page p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${notification.severity === 'critical' ? 'bg-status-danger-bg text-status-danger-fg' : notification.severity === 'warning' ? 'bg-status-warning-bg text-status-warning-fg' : 'bg-active text-primary'}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-heading">{notification.title}</h2>
          <StatusBadge value={labels[notification.severity]} tone={tones[notification.severity]} />
        </div>
        <p className="mt-1 text-sm text-ink">{notification.message}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <time dateTime={notification.date} className="text-xs text-muted">{formatDateTime(notification.date)}</time>
          <Link to={notification.href} className="text-sm font-semibold text-primary hover:underline">Revisar módulo</Link>
        </div>
      </div>
    </article>
  );
}

export function NotificationsPage() {
  const query = useApi((signal) => listNotifications(signal), []);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-heading"><Bell className="h-7 w-7 text-primary" aria-hidden="true" />Notificaciones y alertas</h1>
          <p className="mt-1 text-sm text-muted">Avisos calculados con la información actual del hospital.</p>
        </div>
        <Button variant="secondary" onClick={query.reload} disabled={query.loading}>Actualizar</Button>
      </header>
      {query.error && <ErrorBanner message={query.error.message} />}
      {query.loading ? <div className="flex items-center justify-center gap-3 py-16 text-muted"><Spinner /><span>Cargando notificaciones…</span></div> : (
        <section aria-label="Lista de alertas" className="flex flex-col gap-3">
          {(query.data ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-page px-6 py-14 text-center">
              <AlertTriangle className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
              <h2 className="mt-3 font-semibold text-heading">No hay alertas pendientes</h2>
              <p className="mt-1 text-sm text-muted">Los nuevos avisos aparecerán aquí automáticamente.</p>
            </div>
          ) : (query.data ?? []).map((notification) => <NotificationCard key={notification.id} notification={notification} />)}
        </section>
      )}
    </div>
  );
}
