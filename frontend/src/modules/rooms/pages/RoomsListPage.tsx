import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { deleteRoom, getRoomCounters, listRoomDepartments, listRooms } from '../api';
import { AssignPatientDialog } from '../components/AssignPatientDialog';
import { ReleasePatientDialog } from '../components/ReleasePatientDialog';
import { RoomCard } from '../components/RoomCard';
import { RoomCountersPanel } from '../components/RoomCountersPanel';
import { RoomFormModal } from '../components/RoomFormModal';
import type { Room, RoomAvailability, RoomPatient } from '../types';

export function RoomsListPage() {
  const [departmentId, setDepartmentId] = useState('');
  const [availability, setAvailability] = useState<RoomAvailability | ''>('');
  const [formRoom, setFormRoom] = useState<Room | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [assignRoom, setAssignRoom] = useState<Room | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<{ room: Room; patient: RoomPatient } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filters = { departmentId: departmentId ? Number(departmentId) : undefined, availability };
  const roomsQuery = useApi((signal) => listRooms(filters, signal), [departmentId, availability]);
  const countersQuery = useApi((signal) => getRoomCounters(signal), []);
  const departmentsQuery = useApi((signal) => listRoomDepartments(signal), []);
  const refresh = () => { roomsQuery.reload(); countersQuery.reload(); };
  const saved = (message: string) => {
    setFormOpen(false); setFormRoom(null); setAssignRoom(null); setReleaseTarget(null);
    setToast(message); setError(null); refresh();
  };
  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setError(null);
    try {
      await deleteRoom(deleteTarget.id);
      setDeleteTarget(null); setToast('Habitación eliminada correctamente.'); refresh();
    } catch (reason) {
      setError(toApiError(reason).message); setDeleteTarget(null);
    } finally { setDeleting(false); }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-heading">Habitaciones</h1><p className="mt-1 text-sm text-muted">Administra camas, asignaciones, altas y ocupación hospitalaria.</p></div>
        <Button onClick={() => { setFormRoom(null); setFormOpen(true); }}>Nueva habitación</Button>
      </header>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {countersQuery.error && <ErrorBanner message={countersQuery.error.message} />}
      {countersQuery.data && <RoomCountersPanel counters={countersQuery.data} />}
      <section aria-label="Filtros de habitaciones" className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-page p-4 md:grid-cols-2">
        <select aria-label="Filtrar por departamento" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todos los departamentos</option>
          {(departmentsQuery.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select aria-label="Filtrar por disponibilidad" value={availability} onChange={(event) => setAvailability(event.target.value as RoomAvailability | '')} className={INPUT_CLASSES}>
          <option value="">Todas las habitaciones</option><option value="disponible">Disponibles</option><option value="ocupada">Ocupadas</option>
        </select>
      </section>
      {roomsQuery.error && <ErrorBanner message={roomsQuery.error.message} />}
      {roomsQuery.loading ? <div className="flex items-center justify-center gap-3 py-12 text-muted"><Spinner /><span>Cargando habitaciones…</span></div> : (
        <section aria-label="Listado de habitaciones" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(roomsQuery.data ?? []).length === 0 ? <div className="col-span-full rounded-lg border border-dashed border-border py-12 text-center text-muted">No hay habitaciones que coincidan con los filtros.</div> :
            (roomsQuery.data ?? []).map((room) => <RoomCard key={room.id} room={room} onAssign={setAssignRoom} onRelease={(targetRoom, patient) => setReleaseTarget({ room: targetRoom, patient })} onEdit={(target) => { setFormRoom(target); setFormOpen(true); }} onDelete={setDeleteTarget} />)}
        </section>
      )}
      {formOpen && <RoomFormModal room={formRoom} departments={departmentsQuery.data ?? []} onClose={() => { setFormOpen(false); setFormRoom(null); }} onSaved={saved} />}
      {assignRoom && <AssignPatientDialog room={assignRoom} onClose={() => setAssignRoom(null)} onSaved={saved} />}
      {releaseTarget && <ReleasePatientDialog room={releaseTarget.room} patient={releaseTarget.patient} onClose={() => setReleaseTarget(null)} onSaved={saved} />}
      <ConfirmDialog open={deleteTarget !== null} title="Eliminar habitación" message={deleteTarget ? `¿Eliminar la habitación ${deleteTarget.number}? No se puede eliminar si tiene pacientes asignados o historial asociado.` : ''} confirmLabel="Eliminar habitación" onConfirm={() => void remove()} onCancel={() => !deleting && setDeleteTarget(null)} loading={deleting} />
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={5000} />}
    </div>
  );
}
