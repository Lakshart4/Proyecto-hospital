import { Activity, BarChart3, BedDouble, CalendarPlus, CheckCircle2, Package, Stethoscope, Truck, UserCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { Spinner } from '../../../shared/components/Spinner';
import { StatCard } from '../../../shared/components/StatCard';
import { useApi } from '../../../shared/hooks/useApi';
import { getReportSummary } from '../api';

function inputDate(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
function MetricBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = max === 0 ? 0 : Math.round(value / max * 100);
  return <div><div className="mb-1 flex justify-between gap-3 text-sm"><span className="text-ink">{label}</span><strong className="text-heading">{value}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-active" role="img" aria-label={`${label}: ${value}`}><div className="h-full rounded-full bg-primary transition-all duration-200" style={{ width: `${percentage}%` }} /></div></div>;
}

export function ReportsPage() {
  const [from, setFrom] = useState(() => inputDate(new Date(Date.now() - 29 * 86_400_000)));
  const [to, setTo] = useState(() => inputDate(new Date()));
  const validRange = from !== '' && to !== '' && from <= to;
  const query = useApi((signal) => getReportSummary(from, to, signal), [from, to], { enabled: validRange });
  const report = query.data;
  const activity = report ? [
    { label: 'Tratamientos realizados', value: report.activity.treatmentsPerformed },
    { label: 'Cirugías programadas', value: report.activity.surgeriesScheduled },
    { label: 'Entregas recibidas', value: report.activity.deliveriesReceived },
    { label: 'Entradas de inventario', value: report.activity.inventoryEntries },
    { label: 'Salidas de inventario', value: report.activity.inventoryExits },
    { label: 'Ajustes de inventario', value: report.activity.inventoryAdjustments },
  ] : [];
  const maxActivity = Math.max(0, ...activity.map((item) => item.value));
  const maxMovement = report ? Math.max(report.activity.admissions, report.activity.discharges, report.activity.deaths) : 0;

  return (
    <div className="flex flex-col gap-6">
      <header><h1 className="flex items-center gap-2 text-2xl font-bold text-heading"><BarChart3 className="h-7 w-7 text-primary" aria-hidden="true" />Reportes y estadísticas</h1><p className="mt-1 text-sm text-muted">Actividad hospitalaria calculada directamente desde los registros actuales.</p></header>
      <section aria-label="Periodo del reporte" className="grid grid-cols-1 items-end gap-3 rounded-lg border border-border bg-page p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm font-medium text-ink">Fecha inicial<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)} className={`${INPUT_CLASSES} mt-1`} /></label>
        <label className="text-sm font-medium text-ink">Fecha final<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className={`${INPUT_CLASSES} mt-1`} /></label>
        <Button variant="secondary" onClick={query.reload} disabled={!validRange || query.loading}>Actualizar reporte</Button>
      </section>
      {!validRange && <ErrorBanner message="Selecciona un rango de fechas válido." />}
      {query.error && <ErrorBanner message={query.error.message} />}
      {query.loading && !report ? <div className="flex items-center justify-center gap-3 py-16 text-muted"><Spinner /><span>Calculando reporte…</span></div> : report ? (
        <>
          <section aria-labelledby="report-admissions"><h2 id="report-admissions" className="mb-3 text-lg font-semibold text-heading">Admisiones y actividad clínica</h2><div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Admisiones" value={report.activity.admissions} icon={CalendarPlus} /><StatCard label="Altas" value={report.activity.discharges} icon={CheckCircle2} /><StatCard label="Tratamientos realizados" value={report.activity.treatmentsPerformed} icon={Stethoscope} /><StatCard label="Pacientes activos actuales" value={report.patients.active} icon={UserCheck} /></div></section>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <section className="rounded-lg border border-border bg-page p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-heading"><Activity className="h-5 w-5 text-primary" aria-hidden="true" />Movimientos de pacientes</h2><div className="mt-5 flex flex-col gap-5"><MetricBar label="Admisiones" value={report.activity.admissions} max={maxMovement} /><MetricBar label="Altas" value={report.activity.discharges} max={maxMovement} /><MetricBar label="Fallecimientos" value={report.activity.deaths} max={maxMovement} /></div><div className="mt-6 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center text-sm"><div><p className="text-muted">Activos</p><strong className="text-heading">{report.patients.active}</strong></div><div><p className="text-muted">Dados de alta</p><strong className="text-heading">{report.patients.discharged}</strong></div><div><p className="text-muted">Fallecidos</p><strong className="text-heading">{report.patients.deceased}</strong></div></div></section>
            <section className="rounded-lg border border-border bg-page p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-heading"><Package className="h-5 w-5 text-primary" aria-hidden="true" />Actividad operativa</h2>{maxActivity === 0 ? <p className="py-8 text-center text-sm text-muted">No hay actividad operativa en este periodo.</p> : <div className="mt-5 flex flex-col gap-4">{activity.map((item) => <MetricBar key={item.label} {...item} max={maxActivity} />)}</div>}<p className="mt-5 flex items-center gap-2 text-xs text-muted"><Truck className="h-4 w-4" aria-hidden="true" />Las cifras corresponden al periodo seleccionado.</p></section>
          </div>
          <section className="rounded-lg border border-border bg-page p-5"><h2 className="flex items-center gap-2 text-lg font-semibold text-heading"><BedDouble className="h-5 w-5 text-primary" aria-hidden="true" />Ocupación actual por departamento</h2><div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">{report.occupancy.length === 0 ? <p className="text-sm text-muted">No hay departamentos con información de ocupación.</p> : report.occupancy.map((item) => <article key={item.departmentId}><ProgressBar label={item.department} value={item.rooms === 0 ? 0 : Math.round(item.occupiedRooms / item.rooms * 100)} /><p className="mt-1 text-xs text-muted">{item.occupiedRooms} de {item.rooms} habitaciones ocupadas · {item.activeAssignments} pacientes asignados · capacidad {item.capacity}</p></article>)}</div></section>
        </>
      ) : null}
    </div>
  );
}
