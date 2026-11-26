import { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Tabs, type TabItem } from '../../../shared/components/Tabs';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import { formatDate, formatDateTime } from '../../../shared/lib/formatters';
import { deletePatient, getPatient, listPatientDepartments, listResponsibleStaff, updatePatient } from '../api';
import { PatientStatusDialog, ReadmissionDialog } from '../components/PatientActionDialogs';
import { PatientForm } from '../components/PatientForm';
import { PatientMovementsPanel } from '../components/PatientMovementsPanel';
import { PatientObservationsPanel } from '../components/PatientObservationsPanel';
import { PatientTreatmentsPanel } from '../components/PatientTreatmentsPanel';
import { PATIENT_STATUS_LABELS, patientFullName, toDateInput } from '../utils';

type DetailTab = 'general' | 'observations' | 'history' | 'treatments';
type PatientAction = 'alta' | 'fallecimiento' | 'readmission' | null;

const DETAIL_TABS: readonly TabItem<DetailTab>[] = [
  { id: 'general', label: 'Datos generales' },
  { id: 'observations', label: 'Observaciones' },
  { id: 'history', label: 'Historial' },
  { id: 'treatments', label: 'Tratamientos y cirugías' },
];

export function PatientDetailPage() {
  const { id } = useParams();
  const numericId = Number(id);
  const validId = Number.isInteger(numericId) && numericId > 0;
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [activeTab, setActiveTab] = useState<DetailTab>('general');
  const [action, setAction] = useState<PatientAction>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [toast, setToast] = useState<string | null>(() => {
    const state = location.state as { message?: unknown } | null;
    return typeof state?.message === 'string' ? state.message : null;
  });

  const patientQuery = useApi((signal) => getPatient(numericId, signal), [numericId], { enabled: validId });
  const departmentsQuery = useApi((signal) => listPatientDepartments(signal), [], { enabled: isAdmin });
  const doctorsQuery = useApi((signal) => listResponsibleStaff('DOCTOR', signal), [], { enabled: isAdmin });
  const nursesQuery = useApi((signal) => listResponsibleStaff('NURSE', signal), [], { enabled: isAdmin });
  const patient = patientQuery.data;

  const refreshPatient = () => {
    setRevision((current) => current + 1);
    patientQuery.reload();
  };
  const savedAction = (message: string) => {
    setAction(null);
    setToast(message);
    refreshPatient();
  };
  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deletePatient(numericId);
      navigate('/pacientes', { replace: true });
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const optionsLoading = departmentsQuery.loading || doctorsQuery.loading || nursesQuery.loading;
  const optionsError = departmentsQuery.error ?? doctorsQuery.error ?? nursesQuery.error;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Detalle del paciente</h1>
          {patient && <p className="text-sm text-muted">{patient.internalId}</p>}
        </div>
        <Link to="/pacientes" className="text-sm font-medium text-primary hover:underline">Volver al listado</Link>
      </div>

      {!validId && <ErrorBanner message="El identificador del paciente no es válido." />}
      {patientQuery.error && <ErrorBanner message={patientQuery.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      {patientQuery.loading ? (
        <div className="flex items-center gap-2 py-8"><Spinner /><span className="text-sm text-muted">Cargando paciente…</span></div>
      ) : patient ? (
        <>
          <header className="flex flex-col gap-4 rounded-lg border border-border bg-page p-4 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-heading">{patientFullName(patient)}</h2>
                <StatusBadge value={PATIENT_STATUS_LABELS[patient.status]} tone={patient.status === 'activo' ? 'success' : patient.status === 'fallecido' ? 'danger' : 'info'} />
              </div>
              <p className="mt-2 text-sm text-ink">{patient.department.name} · Ingreso: {formatDate(patient.admissionDate)}</p>
              <p className="mt-1 text-sm text-muted">Médico: {patient.doctor.name} · Enfermero: {patient.nurse.name}</p>
            </div>
            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                {patient.status === 'activo' && (
                  <>
                    <Button variant="secondary" onClick={() => setAction('alta')}>Dar de alta</Button>
                    <Button variant="danger" onClick={() => setAction('fallecimiento')}>Registrar fallecimiento</Button>
                  </>
                )}
                {patient.status === 'dado de alta' && <Button onClick={() => setAction('readmission')}>Registrar reingreso</Button>}
                <Button variant="danger" onClick={() => setConfirmDelete(true)}>Eliminar</Button>
              </div>
            )}
          </header>

          <Tabs tabs={DETAIL_TABS} active={activeTab} onChange={setActiveTab} label="Secciones del paciente" />

          {activeTab === 'general' && (
            <section className="rounded-lg border border-border bg-page p-4 sm:p-6" aria-labelledby="general-data-title">
              <h2 id="general-data-title" className="mb-5 text-lg font-semibold text-heading">{isAdmin ? 'Editar datos generales' : 'Datos generales'}</h2>
              {isAdmin ? (
                <>
                  {optionsError && <div className="mb-4"><ErrorBanner message={optionsError.message} /></div>}
                  {optionsLoading ? (
                    <div className="flex items-center gap-2 py-4"><Spinner /><span className="text-sm text-muted">Cargando opciones…</span></div>
                  ) : (
                    <PatientForm
                      key={patient.updatedAt}
                      departments={departmentsQuery.data ?? [patient.department]}
                      doctors={doctorsQuery.data ?? []}
                      nurses={nursesQuery.data ?? []}
                      initial={{
                        internalId: patient.internalId,
                        firstName: patient.firstName,
                        lastName: patient.lastName,
                        birthDate: toDateInput(patient.birthDate),
                        sex: patient.sex,
                        phone: patient.phone ?? '',
                        admissionDate: toDateInput(patient.admissionDate),
                        reason: patient.reason,
                        departmentId: String(patient.departmentId),
                        doctorId: String(patient.doctorId),
                        nurseId: String(patient.nurseId),
                      }}
                      submitLabel="Guardar cambios"
                      onSubmit={async (payload) => {
                        await updatePatient(patient.id, payload);
                        setToast('Datos del paciente guardados correctamente.');
                        refreshPatient();
                      }}
                    />
                  )}
                </>
              ) : (
                <dl className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                  <div><dt className="text-xs font-medium uppercase text-muted">ID interno</dt><dd className="mt-1 text-sm text-ink">{patient.internalId}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Nombre completo</dt><dd className="mt-1 text-sm text-ink">{patientFullName(patient)}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Fecha de nacimiento</dt><dd className="mt-1 text-sm text-ink">{formatDate(patient.birthDate)}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Sexo</dt><dd className="mt-1 text-sm text-ink">{patient.sex}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Teléfono</dt><dd className="mt-1 text-sm text-ink">{patient.phone || 'No registrado'}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Fecha de ingreso</dt><dd className="mt-1 text-sm text-ink">{formatDate(patient.admissionDate)}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Departamento</dt><dd className="mt-1 text-sm text-ink">{patient.department.name}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Estado</dt><dd className="mt-1 text-sm text-ink">{PATIENT_STATUS_LABELS[patient.status]}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Médico responsable</dt><dd className="mt-1 text-sm text-ink">{patient.doctor.name}</dd></div>
                  <div><dt className="text-xs font-medium uppercase text-muted">Enfermero responsable</dt><dd className="mt-1 text-sm text-ink">{patient.nurse.name}</dd></div>
                  {patient.deceasedAt && <div className="md:col-span-2"><dt className="text-xs font-medium uppercase text-muted">Fecha y hora de fallecimiento</dt><dd className="mt-1 text-sm text-ink">{formatDateTime(patient.deceasedAt)}</dd></div>}
                  <div className="md:col-span-2"><dt className="text-xs font-medium uppercase text-muted">Motivo general de hospitalización</dt><dd className="mt-1 whitespace-pre-wrap text-sm text-ink">{patient.reason}</dd></div>
                </dl>
              )}
            </section>
          )}

          {activeTab === 'observations' && <PatientObservationsPanel patient={patient} onChanged={refreshPatient} />}
          {activeTab === 'history' && <PatientMovementsPanel patientId={patient.id} revision={revision} />}
          {activeTab === 'treatments' && <PatientTreatmentsPanel patient={patient} revision={revision} onChanged={refreshPatient} />}

          {(action === 'alta' || action === 'fallecimiento') && (
            <PatientStatusDialog key={action} patient={patient} action={action} onClose={() => setAction(null)} onSaved={savedAction} />
          )}
          {action === 'readmission' && (
            <ReadmissionDialog patient={patient} departments={departmentsQuery.data ?? [patient.department]} onClose={() => setAction(null)} onSaved={savedAction} />
          )}
          <ConfirmDialog
            open={confirmDelete}
            title="Eliminar paciente"
            message={`¿Seguro que deseas eliminar a ${patientFullName(patient)}? Esta acción no se puede deshacer.`}
            confirmLabel="Eliminar paciente"
            onConfirm={() => void handleDelete()}
            onCancel={() => !deleting && setConfirmDelete(false)}
            loading={deleting}
          />
        </>
      ) : null}
    </div>
  );
}
