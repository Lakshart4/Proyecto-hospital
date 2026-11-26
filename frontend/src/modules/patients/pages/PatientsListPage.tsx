import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { SearchBox } from '../../../shared/components/SearchBox';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Tabs, type TabItem } from '../../../shared/components/Tabs';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import { formatDate, formatDateTime } from '../../../shared/lib/formatters';
import { deletePatient, getPatientCounts, listPatientDepartments, listPatients } from '../api';
import { PatientPagination } from '../components/PatientPagination';
import type { Patient, PatientStatus } from '../types';
import { PATIENT_STATUS_LABELS, patientFullName } from '../utils';

const STATUS_TABS: readonly TabItem<PatientStatus>[] = [
  { id: 'activo', label: 'Activos' },
  { id: 'dado de alta', label: 'Dados de alta' },
  { id: 'fallecido', label: 'Fallecidos' },
];

function statusTone(status: PatientStatus): 'success' | 'info' | 'danger' {
  return status === 'activo' ? 'success' : status === 'fallecido' ? 'danger' : 'info';
}

export function PatientsListPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [status, setStatus] = useState<PatientStatus>('activo');
  const [departmentId, setDepartmentId] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [deleteTarget, setDeleteTarget] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const departmentsQuery = useApi((signal) => listPatientDepartments(signal), []);
  const countsQuery = useApi((signal) => getPatientCounts(signal), []);
  const patientsQuery = useApi(
    (signal) => listPatients({ status, departmentId: departmentId === '' ? undefined : Number(departmentId), search, page, pageSize }, signal),
    [status, departmentId, search, page, pageSize],
  );

  const total = patientsQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => {
    if (!patientsQuery.loading && page > pageCount) setPage(pageCount);
  }, [page, pageCount, patientsQuery.loading]);

  const selectStatus = (next: PatientStatus) => {
    setStatus(next);
    setPage(1);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };
  const changeDepartment = (value: string) => {
    setDepartmentId(value);
    setPage(1);
  };
  const refresh = () => {
    patientsQuery.reload();
    countsQuery.reload();
  };
  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deletePatient(deleteTarget.id);
      setToast('Paciente eliminado correctamente.');
      setDeleteTarget(null);
      refresh();
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const tabs = STATUS_TABS.map((tab) => ({ ...tab, count: countsQuery.data?.[tab.id] }));
  const rows = patientsQuery.data?.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Pacientes</h1>
          <p className="text-sm text-muted">Consulta ingresos, estados y responsables de hospitalización.</p>
        </div>
        {isAdmin && (
          <Link to="/pacientes/nuevo" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-page transition-colors hover:bg-heading">
            Nuevo paciente
          </Link>
        )}
      </div>

      <Tabs tabs={tabs} active={status} onChange={selectStatus} label="Pacientes por estado" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(220px,auto)] md:items-center">
        <SearchBox value={search} onChange={changeSearch} label="Buscar pacientes" placeholder="Buscar por nombre o ID interno…" />
        <select aria-label="Filtrar por departamento" value={departmentId} onChange={(event) => changeDepartment(event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todos los departamentos</option>
          {(departmentsQuery.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
      </div>

      {countsQuery.error && <ErrorBanner message={`No se pudieron cargar los contadores. ${countsQuery.error.message}`} />}
      {departmentsQuery.error && <ErrorBanner message={departmentsQuery.error.message} />}
      {patientsQuery.error && <ErrorBanner message={patientsQuery.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      {patientsQuery.loading ? (
        <div className="flex items-center gap-2 py-8"><Spinner /><span className="text-sm text-muted">Cargando pacientes…</span></div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="w-full overflow-x-auto rounded-lg border border-border">
            <table className="min-w-[900px] w-full divide-y divide-border text-left text-sm">
              <caption className="sr-only">Pacientes {STATUS_TABS.find((tab) => tab.id === status)?.label.toLowerCase()}</caption>
              <thead className="bg-active">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">Paciente</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">ID interno</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">Ingreso</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">Departamento</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">Responsables</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">Estado</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-heading">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-page">
                {rows.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">No hay pacientes que coincidan con los filtros.</td></tr>
                ) : rows.map((patient) => (
                  <tr key={patient.id} className="align-top hover:bg-active">
                    <td className="px-4 py-3">
                      <Link to={`/pacientes/${patient.id}`} className="font-medium text-primary hover:underline">{patientFullName(patient)}</Link>
                      <span className="mt-1 block text-xs text-muted">{patient.sex} · Nacimiento: {formatDate(patient.birthDate)}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-ink">{patient.internalId}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink">{formatDate(patient.admissionDate)}</td>
                    <td className="px-4 py-3 text-ink">{patient.department.name}</td>
                    <td className="px-4 py-3 text-ink">
                      <span className="block text-xs"><strong>Médico:</strong> {patient.doctor.name}</span>
                      <span className="mt-1 block text-xs"><strong>Enfermero:</strong> {patient.nurse.name}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <StatusBadge value={PATIENT_STATUS_LABELS[patient.status]} tone={statusTone(patient.status)} />
                      {patient.deceasedAt && <span className="mt-1 block text-xs text-muted">{formatDateTime(patient.deceasedAt)}</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link to={`/pacientes/${patient.id}`} className="font-medium text-primary hover:underline">Ver detalle</Link>
                        {isAdmin && <Button variant="danger" className="px-2 py-1 text-xs" onClick={() => setDeleteTarget(patient)}>Eliminar</Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PatientPagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          />
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar paciente"
        message={deleteTarget ? `¿Seguro que deseas eliminar a ${patientFullName(deleteTarget)}? También se eliminarán su historial y tratamientos asociados.` : ''}
        confirmLabel="Eliminar paciente"
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
