import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BedDouble,
  Bell,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  Package,
  RefreshCw,
  Truck,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../shared/components/Button';
import { ErrorBanner } from '../../shared/components/ErrorBanner';
import { Spinner } from '../../shared/components/Spinner';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useApi } from '../../shared/hooks/useApi';
import { formatDateTime } from '../../shared/lib/formatters';
import { listNotifications, type HospitalNotification, type NotificationKind, type NotificationSeverity } from './api';

const icons = {
  stock: Package,
  treatment: CalendarClock,
  equipment: Wrench,
  delivery: Truck,
  appointment: CalendarCheck,
  room: BedDouble,
} as const;

const kindLabels: Record<NotificationKind, string> = {
  stock: 'Inventario',
  treatment: 'Tratamientos',
  equipment: 'Equipos',
  delivery: 'Entregas',
  appointment: 'Citas',
  room: 'Habitaciones',
};

const severityTones = { info: 'info', warning: 'warning', critical: 'danger' } as const;
const severityLabels = { info: 'Informativa', warning: 'Atención', critical: 'Crítica' } as const;

const SEVERITY_FILTERS: readonly { value: 'all' | NotificationSeverity; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'critical', label: 'Críticas' },
  { value: 'warning', label: 'Atención' },
  { value: 'info', label: 'Informativas' },
];

const KIND_FILTERS: readonly { value: 'all' | NotificationKind; label: string }[] = [
  { value: 'all', label: 'Todos los tipos' },
  { value: 'stock', label: 'Inventario' },
  { value: 'appointment', label: 'Citas' },
  { value: 'treatment', label: 'Tratamientos' },
  { value: 'equipment', label: 'Equipos' },
  { value: 'room', label: 'Habitaciones' },
  { value: 'delivery', label: 'Entregas' },
];

function severityIconClass(severity: NotificationSeverity): string {
  if (severity === 'critical') return 'bg-status-danger-bg text-status-danger-fg';
  if (severity === 'warning') return 'bg-status-warning-bg text-status-warning-fg';
  return 'bg-active text-primary';
}

function NotificationCard({ notification }: { notification: HospitalNotification }) {
  const Icon = icons[notification.kind];
  return (
    <article className="flex gap-4 rounded-xl border border-border bg-page p-4 shadow-sm transition-shadow hover:shadow-md">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${severityIconClass(notification.severity)}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-heading">{notification.title}</h2>
          <StatusBadge value={severityLabels[notification.severity]} tone={severityTones[notification.severity]} />
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{kindLabels[notification.kind]}</span>
        </div>
        <p className="mt-1 text-sm text-ink">{notification.message}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <time dateTime={notification.date} className="text-xs text-muted">{formatDateTime(notification.date)}</time>
          {notification.href && (
            <Link to={notification.href} className="text-sm font-semibold text-primary hover:underline">Revisar módulo</Link>
          )}
        </div>
      </div>
    </article>
  );
}

export function NotificationsPage() {
  const query = useApi((signal) => listNotifications(signal), []);
  const [severity, setSeverity] = useState<'all' | NotificationSeverity>('all');
  const [kind, setKind] = useState<'all' | NotificationKind>('all');

  const notifications = useMemo(() => query.data ?? [], [query.data]);
  const counts = useMemo(() => ({
    critical: notifications.filter((item) => item.severity === 'critical').length,
    warning: notifications.filter((item) => item.severity === 'warning').length,
    info: notifications.filter((item) => item.severity === 'info').length,
  }), [notifications]);

  const filtered = useMemo(
    () => notifications.filter((item) => (severity === 'all' || item.severity === severity) && (kind === 'all' || item.kind === kind)),
    [notifications, severity, kind],
  );

  const summary = [
    { label: 'Críticas', value: counts.critical, tone: 'text-status-danger-fg', bg: 'bg-status-danger-bg' },
    { label: 'Atención', value: counts.warning, tone: 'text-status-warning-fg', bg: 'bg-status-warning-bg' },
    { label: 'Informativas', value: counts.info, tone: 'text-primary', bg: 'bg-active' },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-heading">
            <Bell className="h-7 w-7 text-primary" aria-hidden="true" />
            Centro de alertas
          </h1>
          <p className="mt-1 text-sm text-muted">Avisos calculados con la información actual del hospital y el alcance de tu rol.</p>
        </div>
        <Button variant="secondary" onClick={query.reload} disabled={query.loading}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${query.loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </header>

      {query.error && <ErrorBanner message={query.error.message} />}

      {query.loading && !query.data ? (
        <div role="status" className="flex items-center justify-center gap-3 py-16 text-muted">
          <Spinner />
          <span>Cargando notificaciones…</span>
        </div>
      ) : (
        <>
          <section aria-label="Resumen de alertas" data-testid="alerts-summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {summary.map((item) => (
              <article key={item.label} className="flex items-center gap-3 rounded-xl border border-border bg-page p-4 shadow-sm">
                <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${item.bg} ${item.tone}`}>
                  <AlertTriangle className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted">{item.label}</p>
                  <p className={`text-2xl font-bold ${item.tone}`}>{item.value}</p>
                </div>
              </article>
            ))}
          </section>

          <section aria-label="Filtros de alertas" className="flex flex-col gap-3 rounded-xl border border-border bg-page p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Severidad</span>
              {SEVERITY_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={severity === filter.value}
                  onClick={() => setSeverity(filter.value)}
                  className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    severity === filter.value
                      ? 'border-primary bg-active text-heading'
                      : 'border-border bg-page text-muted hover:bg-slate-50 hover:text-ink'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Tipo</span>
              {KIND_FILTERS.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  aria-pressed={kind === filter.value}
                  onClick={() => setKind(filter.value)}
                  className={`min-h-9 rounded-full border px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    kind === filter.value
                      ? 'border-primary bg-active text-heading'
                      : 'border-border bg-page text-muted hover:bg-slate-50 hover:text-ink'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </section>

          <section aria-label="Lista de alertas" className="flex flex-col gap-3">
            {filtered.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-page px-6 py-14 text-center">
                {notifications.length === 0 ? (
                  <>
                    <CheckCircle2 className="mx-auto h-10 w-10 text-accent" aria-hidden="true" />
                    <h2 className="mt-3 font-semibold text-heading">No hay alertas pendientes</h2>
                    <p className="mt-1 text-sm text-muted">Los nuevos avisos aparecerán aquí automáticamente.</p>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="mx-auto h-10 w-10 text-muted" aria-hidden="true" />
                    <h2 className="mt-3 font-semibold text-heading">Sin resultados para los filtros</h2>
                    <p className="mt-1 text-sm text-muted">Prueba con otra severidad o tipo de alerta.</p>
                  </>
                )}
              </div>
            ) : (
              filtered.map((notification) => <NotificationCard key={notification.id} notification={notification} />)
            )}
          </section>
        </>
      )}
    </div>
  );
}
