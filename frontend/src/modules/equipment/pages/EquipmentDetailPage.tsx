import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { formatDate } from '../../../shared/lib/formatters';
import { changeEquipmentStatus, deleteEquipment, getEquipment, getEquipmentMaintenance, listDepartments, updateEquipment } from '../api';
import { CloseMaintenanceDialog } from '../components/CloseMaintenanceDialog';
import { EquipmentForm, equipmentToFormValues } from '../components/EquipmentForm';
import { EmptyState, LoadingState } from '../components/LoadingState';
import { OPERATIONAL_STATUSES, type EquipmentPayload, type MaintenanceRecord, type OperationalStatus } from '../types';

export function EquipmentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const numericId = Number(id);
  const validId = Number.isSafeInteger(numericId) && numericId > 0;
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [closeTarget, setCloseTarget] = useState<MaintenanceRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const equipmentQuery = useApi((signal) => getEquipment(numericId, signal), [numericId], { enabled: validId });
  const historyQuery = useApi((signal) => getEquipmentMaintenance(numericId, signal), [numericId], { enabled: validId });
  const departmentsQuery = useApi((signal) => listDepartments(signal), []);
  const equipment = equipmentQuery.data;

  const handleUpdate = async (payload: EquipmentPayload) => {
    await updateEquipment(numericId, payload);
    setEditing(false);
    setToast('Equipo actualizado correctamente.');
    equipmentQuery.reload();
  };

  const handleStatus = async (operationalStatus: OperationalStatus) => {
    if (!equipment || operationalStatus === equipment.operationalStatus || updatingStatus) return;
    setUpdatingStatus(true);
    setActionError(null);
    try {
      await changeEquipmentStatus(equipment.id, operationalStatus);
      setToast('Estado operativo actualizado.');
      equipmentQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteEquipment(numericId);
      navigate('/equipos', { replace: true });
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">Detalle del equipo</h1>
          {equipment && <p className="mt-1 text-sm text-muted">{equipment.name}</p>}
        </div>
        <Link to="/equipos" className="text-sm font-medium text-primary hover:underline">Volver a equipos</Link>
      </div>

      {!validId && <ErrorBanner message="El identificador del equipo no es válido." />}
      {equipmentQuery.error && <ErrorBanner title="No se pudo cargar el equipo" message={equipmentQuery.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={4000} />}

      {equipmentQuery.loading ? <LoadingState message="Cargando equipo…" /> : equipment && (
        <article className="flex flex-col gap-5 rounded-lg border border-border bg-page p-5 md:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold text-heading">{equipment.name}</h2>
                <StatusBadge value={equipment.operationalStatus} />
                {equipment.maintenanceRequired && <StatusBadge value="Mantenimiento requerido" tone="warning" />}
              </div>
              <p className="mt-2 text-sm text-muted">{equipment.category} · {equipment.department.name}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>Editar</Button>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>Eliminar</Button>
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs font-medium uppercase text-muted">Cantidad</dt><dd className="mt-1 text-ink">{equipment.quantity}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted">Ubicación</dt><dd className="mt-1 text-ink">{equipment.location}</dd></div>
            <div><dt className="text-xs font-medium uppercase text-muted">Departamento</dt><dd className="mt-1 text-ink">{equipment.department.name}</dd></div>
            <div>
              <dt className="text-xs font-medium uppercase text-muted">Cambiar estado</dt>
              <dd className="mt-1">
                <select aria-label="Cambiar estado operativo" value={equipment.operationalStatus} onChange={(event) => void handleStatus(event.target.value as OperationalStatus)} disabled={updatingStatus} className={INPUT_CLASSES}>
                  {OPERATIONAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </dd>
            </div>
          </dl>
        </article>
      )}

      {validId && (
        <section aria-labelledby="maintenance-history-title" className="flex flex-col gap-4">
          <div>
            <h2 id="maintenance-history-title" className="text-lg font-semibold text-heading">Historial de mantenimiento</h2>
            <p className="text-sm text-muted">Registros ordenados del más reciente al más antiguo.</p>
          </div>
          {historyQuery.error && <ErrorBanner title="No se pudo cargar el historial" message={historyQuery.error.message} />}
          {historyQuery.loading && !historyQuery.data ? <LoadingState message="Cargando historial…" /> : historyQuery.error ? null : (historyQuery.data?.length ?? 0) === 0 ? (
            <EmptyState title="Sin mantenimientos" message="Este equipo todavía no tiene registros de mantenimiento." />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {historyQuery.data?.map((record) => (
                <article key={record.id} className="flex flex-col gap-3 rounded-lg border border-border bg-page p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-semibold capitalize text-heading">{record.type}</h3>
                    {record.endDate === null ? <StatusBadge value="En curso" tone="warning" /> : <StatusBadge value={record.resultingStatus ?? 'Cerrado'} />}
                  </div>
                  <p className="text-sm text-ink">{record.description}</p>
                  <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-muted">Técnico</dt><dd className="text-ink">{record.technician}</dd></div>
                    <div><dt className="text-muted">Inicio</dt><dd className="text-ink">{formatDate(record.startDate)}</dd></div>
                    <div><dt className="text-muted">Fin</dt><dd className="text-ink">{record.endDate ? formatDate(record.endDate) : 'Pendiente'}</dd></div>
                  </dl>
                  {record.endDate === null && <Button variant="secondary" className="self-start" onClick={() => setCloseTarget(record)}>Cerrar mantenimiento</Button>}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {equipment && (
        <Modal open={editing} title="Editar equipo" onClose={() => setEditing(false)}>
          <EquipmentForm
            departments={departmentsQuery.data?.length ? departmentsQuery.data : [equipment.department]}
            initial={equipmentToFormValues(equipment)}
            submitLabel="Guardar cambios"
            onSubmit={handleUpdate}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
      <ConfirmDialog
        open={confirmDelete}
        title="Eliminar equipo"
        message={equipment ? `¿Deseas eliminar “${equipment.name}”? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setConfirmDelete(false)}
        loading={deleting}
      />
      <CloseMaintenanceDialog
        record={closeTarget}
        onClose={() => setCloseTarget(null)}
        onClosed={() => {
          setCloseTarget(null);
          historyQuery.reload();
          equipmentQuery.reload();
          setToast('Mantenimiento cerrado correctamente.');
        }}
      />
    </div>
  );
}

export default EquipmentDetailPage;
