import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { useApi } from '../../../shared/hooks/useApi';
import { formatDateTime } from '../../../shared/lib/formatters';
import { MESSAGES } from '../../../shared/lib/messages';
import { listPatientMovements } from '../api';
import type { PatientMovementType } from '../types';

const MOVEMENT_LABELS: Record<PatientMovementType, string> = {
  ingreso: 'Ingreso',
  alta: 'Alta',
  fallecimiento: 'Fallecimiento',
};

export interface PatientMovementsPanelProps {
  patientId: number;
  revision?: number;
}

export function PatientMovementsPanel({ patientId, revision = 0 }: PatientMovementsPanelProps) {
  const query = useApi((signal) => listPatientMovements(patientId, signal), [patientId, revision]);

  return (
    <section className="rounded-lg border border-border bg-page p-4 sm:p-6" aria-labelledby="patient-history-title">
      <div className="mb-5">
        <h2 id="patient-history-title" className="text-lg font-semibold text-heading">Historial del paciente</h2>
        <p className="text-sm text-muted">Movimientos de solo lectura, del más reciente al más antiguo.</p>
      </div>
      {query.error && <ErrorBanner message={query.error.message} />}
      {query.loading ? (
        <div className="flex items-center gap-2 py-5"><Spinner /><span className="text-sm text-muted">Cargando historial…</span></div>
      ) : (query.data ?? []).length === 0 ? (
        <p className="py-5 text-center text-sm text-muted">No hay movimientos registrados.</p>
      ) : (
        <ol className="relative ml-2 flex flex-col gap-5 border-l border-border pl-5">
          {(query.data ?? []).map((movement) => (
            <li key={movement.id} className="relative">
              <span aria-hidden="true" className="absolute -left-[27px] top-1.5 h-3 w-3 rounded-full border-2 border-page bg-primary" />
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge value={MOVEMENT_LABELS[movement.type]} tone={movement.type === 'fallecimiento' ? 'danger' : movement.type === 'alta' ? 'info' : 'success'} />
                <time className="text-sm font-medium text-heading" dateTime={movement.occurredAt}>{formatDateTime(movement.occurredAt)}</time>
              </div>
              <p className="mt-2 text-sm text-ink">{movement.department.name} · Registrado por {movement.user.name} ({MESSAGES.roles[movement.user.role]})</p>
              {movement.note && <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{movement.note}</p>}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
