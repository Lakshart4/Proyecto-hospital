import { CalendarCheck, Pencil, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { formatDateTime } from '../../../shared/lib/formatters';
import { listPatients, listResponsibleStaff } from '../../patients/api';
import type { StaffOption } from '../../patients/types';
import { listAppointments } from '../api';
import { AppointmentFormModal } from '../components/AppointmentFormModal';
import { CancelAppointmentDialog } from '../components/CancelAppointmentDialog';
import type { Appointment, AppointmentStatus } from '../types';

export function AppointmentsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [status, setStatus] = useState<AppointmentStatus | ''>('programada');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Appointment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const appointmentsQuery = useApi((signal) => listAppointments({ status, from: from || undefined, to: to || undefined, page, pageSize }, signal), [status, from, to, page, pageSize]);
  const patientsQuery = useApi((signal) => listPatients({ status: 'activo', page: 1, pageSize: 100 }, signal), [formOpen], { enabled: formOpen });
  const doctorsQuery = useApi((signal) => listResponsibleStaff('DOCTOR', signal), [formOpen], { enabled: formOpen && isAdmin });
  const currentDoctor: StaffOption[] = user?.role === 'DOCTOR' ? [{ id: user.id, name: user.name, internalId: '', role: 'DOCTOR' }] : [];
  const doctors = isAdmin ? (doctorsQuery.data ?? []) : currentDoctor;
  const total = appointmentsQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const closeForm = () => { setFormOpen(false); setEditTarget(null); };
  const saved = (message: string) => { closeForm(); setCancelTarget(null); setToast(message); appointmentsQuery.reload(); };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-2xl font-bold text-heading"><CalendarCheck className="h-7 w-7 text-primary" aria-hidden="true" />Citas médicas</h1><p className="mt-1 text-sm text-muted">Programa y administra citas sin empalmes entre pacientes y médicos.</p></div>
        <Button onClick={() => { setEditTarget(null); setFormOpen(true); }}>Nueva cita</Button>
      </header>
      <section aria-label="Filtros de citas" className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-page p-4 md:grid-cols-3">
        <label className="text-sm text-ink">Estado<select value={status} onChange={(event) => { setStatus(event.target.value as AppointmentStatus | ''); setPage(1); }} className={`${INPUT_CLASSES} mt-1`}><option value="programada">Programadas</option><option value="cancelada">Canceladas</option><option value="">Todas</option></select></label>
        <label className="text-sm text-ink">Desde<input type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); }} className={`${INPUT_CLASSES} mt-1`} /></label>
        <label className="text-sm text-ink">Hasta<input type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); }} className={`${INPUT_CLASSES} mt-1`} /></label>
      </section>
      {appointmentsQuery.error && <ErrorBanner message={appointmentsQuery.error.message} />}
      {appointmentsQuery.loading ? <div className="flex items-center justify-center gap-3 py-12 text-muted"><Spinner /><span>Cargando citas…</span></div> : (
        <section className="overflow-x-auto rounded-lg border border-border bg-page">
          <table className="min-w-[900px] w-full divide-y divide-border text-left text-sm">
            <thead className="bg-active"><tr><th className="px-4 py-3 text-heading">Paciente</th><th className="px-4 py-3 text-heading">Médico</th><th className="px-4 py-3 text-heading">Fecha y duración</th><th className="px-4 py-3 text-heading">Motivo</th><th className="px-4 py-3 text-heading">Estado</th><th className="px-4 py-3 text-heading">Acciones</th></tr></thead>
            <tbody className="divide-y divide-border">
              {(appointmentsQuery.data?.data ?? []).length === 0 ? <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">No hay citas que coincidan con los filtros.</td></tr> : appointmentsQuery.data?.data.map((appointment) => (
                <tr key={appointment.id} className="align-top hover:bg-active">
                  <td className="px-4 py-3"><span className="font-medium text-ink">{appointment.patient.firstName} {appointment.patient.lastName}</span><span className="mt-1 block text-xs text-muted">{appointment.patient.internalId}</span></td>
                  <td className="px-4 py-3 text-ink">{appointment.doctor.name}</td>
                  <td className="px-4 py-3 text-ink"><time dateTime={appointment.scheduledAt}>{formatDateTime(appointment.scheduledAt)}</time><span className="mt-1 block text-xs text-muted">{appointment.durationMinutes} minutos</span></td>
                  <td className="max-w-xs px-4 py-3 text-ink"><span className="block truncate" title={appointment.reason}>{appointment.reason}</span>{appointment.cancelReason && <span className="mt-1 block text-xs text-muted">Cancelación: {appointment.cancelReason}</span>}</td>
                  <td className="px-4 py-3"><StatusBadge value={appointment.status === 'programada' ? 'Programada' : 'Cancelada'} tone={appointment.status === 'programada' ? 'success' : 'neutral'} /></td>
                  <td className="px-4 py-3">{appointment.status === 'programada' ? <div className="flex gap-2"><Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => { setEditTarget(appointment); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Editar</Button><Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setCancelTarget(appointment)}><XCircle className="h-3.5 w-3.5" aria-hidden="true" />Cancelar</Button></div> : <span className="text-xs text-muted">Sin acciones</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {pages > 1 && <nav aria-label="Paginación de citas" className="flex flex-wrap items-center justify-end gap-3 text-sm"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Anterior</Button><span>Página {page} de {pages}</span><Button variant="secondary" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Siguiente</Button><select aria-label="Filas por página" value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className={INPUT_CLASSES}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select></nav>}
      {formOpen && (patientsQuery.loading || (isAdmin && doctorsQuery.loading) ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50"><Spinner label="Cargando formulario…" /></div> : <AppointmentFormModal appointment={editTarget} patients={patientsQuery.data?.data ?? []} doctors={doctors} onClose={closeForm} onSaved={saved} />)}
      {formOpen && (patientsQuery.error || doctorsQuery.error) && <ErrorBanner message={(patientsQuery.error ?? doctorsQuery.error)!.message} onDismiss={closeForm} />}
      {cancelTarget && <CancelAppointmentDialog appointment={cancelTarget} onClose={() => setCancelTarget(null)} onSaved={saved} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={4000} />}
    </div>
  );
}
