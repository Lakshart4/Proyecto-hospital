import {
  BedDouble,
  Building2,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  HeartPulse,
  Package,
  PackagePlus,
  RefreshCw,
  UserPlus,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { canAccessPath } from '../../../app/navigation';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { Spinner } from '../../../shared/components/Spinner';
import { StatCard } from '../../../shared/components/StatCard';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { formatDateTime } from '../../../shared/lib/formatters';
import { getDashboard } from '../api';
import type { DepartmentOccupancy, UpcomingEvent } from '../types';

function departmentName(item: DepartmentOccupancy): string {
  return item.department?.name ?? item.departmentName ?? item.name ?? `Departamento ${item.departmentId}`;
}

function eventStart(event: UpcomingEvent): string {
  return event.start ?? event.startAt ?? '';
}

function eventTone(type: string): 'success' | 'info' | 'orange' | 'neutral' {
  if (type === 'actividad') return 'success';
  if (type === 'entrega') return 'orange';
  if (type === 'general') return 'info';
  return 'neutral';
}

interface QuickAction {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  { to: '/pacientes', label: 'Nuevo paciente', description: 'Registrar ingreso', icon: UserPlus },
  { to: '/citas', label: 'Agendar cita', description: 'Programar consulta', icon: CalendarPlus },
  { to: '/inventario', label: 'Registrar producto', description: 'Actualizar inventario', icon: PackagePlus },
  { to: '/reportes', label: 'Ver reportes', description: 'Resumen institucional', icon: ClipboardList },
];

function todayLabel(): string {
  return new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
}

export function DashboardPage() {
  const dashboardQuery = useApi((signal) => getDashboard(signal), []);
  const dashboard = dashboardQuery.data;
  const { user } = useAuth();
  const actions = QUICK_ACTIONS.filter((action) => user !== null && canAccessPath(user.role, action.to));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-accent">{todayLabel()}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-heading sm:text-3xl">Panel principal</h1>
          <p className="mt-1 text-sm text-muted">
            {user ? `Hola, ${user.name}. ` : ''}Situación actual del hospital y actividad de los próximos 7 días.
          </p>
        </div>
        <Button variant="secondary" onClick={dashboardQuery.reload} disabled={dashboardQuery.loading}>
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${dashboardQuery.loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </header>

      {actions.length > 0 && (
        <section aria-labelledby="dashboard-actions-title" className="flex flex-col gap-3">
          <h2 id="dashboard-actions-title" className="sr-only">Acciones rápidas</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {actions.map((action) => (
              <Link
                key={action.to}
                to={action.to}
                className="group flex min-h-11 items-center gap-3 rounded-xl border border-border bg-page p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-active text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                  <action.icon aria-hidden="true" className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{action.label}</span>
                  <span className="block truncate text-xs text-muted">{action.description}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {dashboardQuery.error ? (
        <section aria-label="Error del panel" className="flex flex-col items-start gap-3">
          <ErrorBanner title="No fue posible cargar el panel" message={dashboardQuery.error.message} />
          <Button onClick={dashboardQuery.reload}>Reintentar</Button>
        </section>
      ) : dashboardQuery.loading && !dashboard ? (
        <div role="status" className="flex items-center justify-center gap-3 rounded-xl border border-border bg-page py-16 text-sm text-muted">
          <Spinner label="Cargando panel administrativo…" />
          <span>Cargando panel administrativo…</span>
        </div>
      ) : dashboard ? (
        <>
          {dashboardQuery.loading && <p role="status" className="text-sm text-muted">Actualizando información del panel…</p>}

          <section aria-labelledby="dashboard-stats-title" className="flex flex-col gap-3">
            <h2 id="dashboard-stats-title" className="text-lg font-semibold text-heading">Estadísticas generales</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Empleados" value={dashboard.cards.employees} icon={Users} tone="primary" />
              <StatCard label="Pacientes activos" value={dashboard.cards.activePatients} icon={HeartPulse} tone="accent" />
              <StatCard label="Habitaciones disponibles" value={dashboard.cards.availableRooms} icon={BedDouble} tone="accent" />
              <StatCard label="Habitaciones ocupadas" value={dashboard.cards.occupiedRooms} icon={Building2} tone="neutral" />
              <StatCard label="Productos con stock bajo" value={dashboard.cards.lowStockProducts} icon={Package} tone="warning" />
              <StatCard label="Equipos en mantenimiento" value={dashboard.cards.equipmentInMaintenance} icon={Wrench} tone="warning" />
            </div>
          </section>

          <section aria-labelledby="dashboard-indicators-title" className="flex flex-col gap-3">
            <h2 id="dashboard-indicators-title" className="text-lg font-semibold text-heading">Indicadores adicionales</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <article className="rounded-xl border border-border bg-page p-4 shadow-sm">
                <p className="text-sm text-muted">Pacientes dados de alta</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{dashboard.indicators.dischargedPatients}</p>
              </article>
              <article className="rounded-xl border border-border bg-page p-4 shadow-sm">
                <p className="text-sm text-muted">Pacientes fallecidos</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-ink">{dashboard.indicators.deceasedPatients}</p>
              </article>
              <article className="rounded-xl border border-border bg-page p-4 shadow-sm">
                <p className="text-sm text-muted">Equipos fuera de servicio</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-status-danger-fg">{dashboard.indicators.outOfServiceEquipment}</p>
              </article>
              <article className="rounded-xl border border-border bg-page p-4 shadow-sm">
                <p className="text-sm text-muted">Productos agotados</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-status-danger-fg">{dashboard.indicators.outOfStockProducts}</p>
              </article>
            </div>
          </section>

          <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
            <section aria-labelledby="occupancy-title" className="rounded-xl border border-border bg-page p-5 shadow-sm">
              <h2 id="occupancy-title" className="text-lg font-semibold text-heading">Ocupación por departamento</h2>
              <p className="mt-1 text-sm text-muted">Habitaciones ocupadas y porcentaje sobre el total.</p>
              {dashboard.byDepartment.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No hay departamentos para mostrar.</p>
              ) : (
                <div className="mt-5 flex flex-col gap-5">
                  {dashboard.byDepartment.map((item) => (
                    <article key={item.departmentId}>
                      <ProgressBar label={departmentName(item)} value={item.percentage} />
                      <p className="mt-1 text-xs text-muted">{item.occupied} ocupadas de {item.total} habitaciones</p>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section aria-labelledby="upcoming-title" className="rounded-xl border border-border bg-page p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays aria-hidden="true" className="h-5 w-5 text-primary" />
                <h2 id="upcoming-title" className="text-lg font-semibold text-heading">Próximos 7 días</h2>
              </div>
              <p className="mt-1 text-sm text-muted">Entregas programadas y actividades, ordenadas por fecha.</p>
              {dashboard.upcoming.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted">No hay entregas ni actividades programadas.</p>
              ) : (
                <ol className="mt-5 divide-y divide-border">
                  {dashboard.upcoming.map((event) => (
                    <li key={event.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-ink">{event.title}</p>
                          <time dateTime={eventStart(event)} className="text-sm text-muted">{formatDateTime(eventStart(event))}</time>
                        </div>
                        <StatusBadge value={event.type} tone={eventTone(event.type)} />
                      </div>
                      {event.description && <p className="text-sm text-muted">{event.description}</p>}
                      {event.delivery && (
                        <p className="text-sm text-muted">
                          {event.delivery.supplierName} · {event.delivery.productName} · {event.delivery.quantityRequested} unidades
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default DashboardPage;
