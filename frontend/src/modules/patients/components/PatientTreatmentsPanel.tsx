import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import { formatDateTime } from '../../../shared/lib/formatters';
import { changeTreatmentStatus, listTreatments } from '../api';
import { TREATMENT_STATUSES, TREATMENT_TYPES } from '../schemas';
import type { Patient, Treatment, TreatmentStatus, TreatmentType } from '../types';
import { TREATMENT_STATUS_LABELS, TREATMENT_TYPE_LABELS } from '../utils';
import { TreatmentFormModal } from './TreatmentFormModal';

export interface PatientTreatmentsPanelProps {
  patient: Patient;
  revision?: number;
  onChanged: () => void;
}

export function PatientTreatmentsPanel({ patient, revision = 0, onChanged }: PatientTreatmentsPanelProps) {
  const { user } = useAuth();
  const [type, setType] = useState<TreatmentType | ''>('');
  const [status, setStatus] = useState<TreatmentStatus | ''>('');
  const [editor, setEditor] = useState<Treatment | 'new' | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Treatment | null>(null);
  const [changingStatus, setChangingStatus] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const query = useApi((signal) => listTreatments(patient.id, { type, status }, signal), [patient.id, type, status, revision]);

  const isDoctor = user?.role === 'DOCTOR' && patient.doctorId === user.id;
  const isNurse = user?.role === 'NURSE' && patient.nurseId === user.id;
  const active = patient.status === 'activo';
  const canManage = user?.role === 'ADMIN' || (isDoctor && active);
  const canMarkDone = user?.role === 'ADMIN' || ((isDoctor || isNurse) && active);

  const refresh = () => {
    query.reload();
    onChanged();
  };
  const markDone = async (treatment: Treatment) => {
    if (changingStatus) return;
    setChangingStatus(true);
    setActionError(null);
    try {
      await changeTreatmentStatus(patient.id, treatment.id, 'realizado');
      setToast('Tratamiento marcado como realizado.');
      refresh();
    } catch (reason) {
      setActionError(toApiError(reason).message);
    } finally {
      setChangingStatus(false);
    }
  };
  const cancel = async () => {
    if (!cancelTarget || changingStatus) return;
    setChangingStatus(true);
    setCancelError(null);
    try {
      await changeTreatmentStatus(patient.id, cancelTarget.id, 'cancelado');
      setCancelTarget(null);
      setToast('Tratamiento cancelado correctamente.');
      refresh();
    } catch (reason) {
      setCancelError(toApiError(reason).message);
    } finally {
      setChangingStatus(false);
    }
  };

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-page p-4 sm:p-6" aria-labelledby="treatments-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="treatments-title" className="text-lg font-semibold text-heading">Tratamientos y cirugías</h2>
          <p className="text-sm text-muted">Consulta y filtra los tratamientos programados, realizados y cancelados.</p>
        </div>
        {canManage && <Button onClick={() => setEditor('new')}>Programar tratamiento</Button>}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-ink">Tipo
          <select aria-label="Filtrar tratamientos por tipo" value={type} onChange={(event) => setType(event.target.value as TreatmentType | '')} className={`${INPUT_CLASSES} mt-1`}>
            <option value="">Todos los tipos</option>
            {TREATMENT_TYPES.map((value) => <option key={value} value={value}>{TREATMENT_TYPE_LABELS[value]}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-ink">Estado
          <select aria-label="Filtrar tratamientos por estado" value={status} onChange={(event) => setStatus(event.target.value as TreatmentStatus | '')} className={`${INPUT_CLASSES} mt-1`}>
            <option value="">Todos los estados</option>
            {TREATMENT_STATUSES.map((value) => <option key={value} value={value}>{TREATMENT_STATUS_LABELS[value]}</option>)}
          </select>
        </label>
      </div>
      {query.error && <ErrorBanner message={query.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}
      {query.loading ? (
        <div className="flex items-center gap-2 py-5"><Spinner /><span className="text-sm text-muted">Cargando tratamientos…</span></div>
      ) : (query.data ?? []).length === 0 ? (
        <p className="rounded-md bg-active px-4 py-6 text-center text-sm text-muted">No hay tratamientos que coincidan con los filtros.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {(query.data ?? []).map((treatment) => (
            <article key={treatment.id} className="rounded-md border border-border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge value={TREATMENT_TYPE_LABELS[treatment.type]} tone="info" />
                    <StatusBadge value={TREATMENT_STATUS_LABELS[treatment.status]} tone={treatment.status === 'realizado' ? 'success' : treatment.status === 'cancelado' ? 'danger' : 'warning'} />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-ink">{treatment.description}</p>
                  <p className="mt-2 text-xs text-muted">Programado: {formatDateTime(treatment.scheduledAt)} · Registrado por {treatment.createdBy.name}</p>
                  {treatment.performedAt && <p className="mt-1 text-xs text-muted">Realizado: {formatDateTime(treatment.performedAt)}</p>}
                </div>
                {treatment.status === 'programado' && (canManage || canMarkDone) && (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    {canManage && <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => setEditor(treatment)}>Editar</Button>}
                    {canMarkDone && <Button className="px-3 py-1.5 text-xs" loading={changingStatus} onClick={() => void markDone(treatment)}>Marcar realizado</Button>}
                    {canManage && <Button variant="danger" className="px-3 py-1.5 text-xs" disabled={changingStatus} onClick={() => { setCancelError(null); setCancelTarget(treatment); }}>Cancelar</Button>}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {editor && (
        <TreatmentFormModal
          key={editor === 'new' ? 'new' : editor.id}
          patientId={patient.id}
          treatment={editor}
          onClose={() => setEditor(null)}
          onSaved={(message) => { setEditor(null); setToast(message); refresh(); }}
        />
      )}
      <ConfirmDialog
        open={cancelTarget !== null}
        title="Cancelar tratamiento"
        message={<span>¿Seguro que deseas cancelar este tratamiento?{cancelError && <span className="mt-2 block font-medium text-status-danger-fg">{cancelError}</span>}</span>}
        confirmLabel="Cancelar tratamiento"
        onConfirm={() => void cancel()}
        onCancel={() => !changingStatus && setCancelTarget(null)}
        loading={changingStatus}
      />
    </section>
  );
}
