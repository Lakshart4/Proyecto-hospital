import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { SearchBox } from '../../../shared/components/SearchBox';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { changeEquipmentStatus, createEquipment, deleteEquipment, listDepartments, listEquipment, updateEquipment } from '../api';
import { OPERATIONAL_STATUSES, type Equipment, type EquipmentPayload, type OperationalStatus } from '../types';
import { EquipmentForm, equipmentToFormValues } from './EquipmentForm';
import { EmptyState, LoadingState } from './LoadingState';

export function EquipmentPanel() {
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<OperationalStatus | ''>('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Equipment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const departmentsQuery = useApi((signal) => listDepartments(signal), []);
  const equipmentQuery = useApi(
    (signal) => listEquipment({
      search,
      departmentId: departmentId ? Number(departmentId) : undefined,
      category: category || undefined,
      status: status || undefined,
    }, signal),
    [search, departmentId, category, status],
  );

  const groups = useMemo(() => {
    const grouped = new Map<number, { name: string; items: Equipment[] }>();
    for (const item of equipmentQuery.data ?? []) {
      const group = grouped.get(item.departmentId) ?? { name: item.department.name, items: [] };
      group.items.push(item);
      grouped.set(item.departmentId, group);
    }
    return [...grouped.entries()].sort(([, a], [, b]) => a.name.localeCompare(b.name, 'es'));
  }, [equipmentQuery.data]);

  const categories = useMemo(
    () => [...new Set((equipmentQuery.data ?? []).map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'es')),
    [equipmentQuery.data],
  );

  const handleSave = async (payload: EquipmentPayload) => {
    if (editing) await updateEquipment(editing.id, payload);
    else await createEquipment(payload);
    setFormOpen(false);
    setEditing(null);
    setToast(editing ? 'Equipo actualizado correctamente.' : 'Equipo registrado correctamente.');
    equipmentQuery.reload();
  };

  const handleStatus = async (item: Equipment, operationalStatus: OperationalStatus) => {
    if (operationalStatus === item.operationalStatus || updatingStatus !== null) return;
    setUpdatingStatus(item.id);
    setActionError(null);
    try {
      await changeEquipmentStatus(item.id, operationalStatus);
      setToast(`Estado de “${item.name}” actualizado.`);
      equipmentQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteEquipment(deleteTarget.id);
      setDeleteTarget(null);
      setToast('Equipo eliminado correctamente.');
      equipmentQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const formDepartments = departmentsQuery.data?.length
    ? departmentsQuery.data
    : editing ? [editing.department] : [];

  return (
    <section aria-label="Listado de equipos" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Consulta y administra el equipamiento por departamento.</p>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>Registrar equipo</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-page p-4 md:grid-cols-2 xl:grid-cols-4">
        <SearchBox value={search} onChange={setSearch} label="Buscar equipos" placeholder="Buscar por nombre o ubicación…" />
        <select aria-label="Filtrar por departamento" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todos los departamentos</option>
          {(departmentsQuery.data ?? []).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>
        <select aria-label="Filtrar por categoría" value={category} onChange={(event) => setCategory(event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todas las categorías</option>
          {category && !categories.includes(category) && <option value={category}>{category}</option>}
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Filtrar por estado operativo" value={status} onChange={(event) => setStatus(event.target.value as OperationalStatus | '')} className={INPUT_CLASSES}>
          <option value="">Todos los estados</option>
          {OPERATIONAL_STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
      </div>

      {departmentsQuery.error && <ErrorBanner title="No se pudieron cargar los departamentos" message={departmentsQuery.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {equipmentQuery.error && <ErrorBanner title="No se pudieron cargar los equipos" message={equipmentQuery.error.message} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={4000} />}

      {equipmentQuery.loading && !equipmentQuery.data ? (
        <LoadingState message="Cargando equipos…" />
      ) : equipmentQuery.error ? null : groups.length === 0 ? (
        <EmptyState title="No hay equipos" message="No se encontraron equipos con los filtros seleccionados." />
      ) : (
        <div className="flex flex-col gap-5">
          {equipmentQuery.loading && <p role="status" className="text-sm text-muted">Actualizando equipos…</p>}
          {groups.map(([id, group]) => (
            <article key={id} className="overflow-hidden rounded-lg border border-border bg-page">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-active px-4 py-3">
                <h2 className="font-semibold text-heading">{group.name}</h2>
                <p className="text-sm text-muted">
                  {group.items.length} {group.items.length === 1 ? 'equipo' : 'equipos'} · {group.items.reduce((sum, item) => sum + item.quantity, 0)} unidades
                </p>
              </header>
              <div className="w-full overflow-x-auto">
                <table className="min-w-[940px] w-full divide-y divide-border text-left text-sm">
                  <caption className="sr-only">Equipos de {group.name}</caption>
                  <thead className="bg-page text-heading">
                    <tr>
                      <th scope="col" className="px-4 py-3 font-semibold">Equipo</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Categoría</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Cantidad</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Ubicación</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Estado</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Mantenimiento</th>
                      <th scope="col" className="px-4 py-3 font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {group.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3"><Link to={`/equipos/${item.id}`} className="font-medium text-primary hover:underline">{item.name}</Link></td>
                        <td className="px-4 py-3 text-ink">{item.category}</td>
                        <td className="px-4 py-3 text-ink">{item.quantity}</td>
                        <td className="px-4 py-3 text-ink">{item.location}</td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-44 flex-col gap-2">
                            <StatusBadge value={item.operationalStatus} />
                            <select
                              aria-label={`Cambiar estado de ${item.name}`}
                              value={item.operationalStatus}
                              onChange={(event) => void handleStatus(item, event.target.value as OperationalStatus)}
                              disabled={updatingStatus !== null}
                              className="rounded-md border border-border bg-page px-2 py-1 text-xs text-ink"
                            >
                              {OPERATIONAL_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
                            </select>
                          </div>
                        </td>
                        <td className="px-4 py-3">{item.maintenanceRequired ? <StatusBadge value="Requerido" tone="warning" /> : <span className="text-muted">No requerido</span>}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <Link to={`/equipos/${item.id}`} className="rounded-md border border-border px-3 py-2 text-xs font-medium text-ink hover:bg-active">Historial</Link>
                            <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => { setEditing(item); setFormOpen(true); }}>Editar</Button>
                            <Button variant="danger" className="px-3 py-2 text-xs" onClick={() => setDeleteTarget(item)}>Eliminar</Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal open={formOpen} title={editing ? 'Editar equipo' : 'Registrar equipo'} onClose={() => { setFormOpen(false); setEditing(null); }}>
        <EquipmentForm
          key={editing ? `${editing.id}-${editing.updatedAt}` : 'new'}
          departments={formDepartments}
          initial={editing ? equipmentToFormValues(editing) : undefined}
          submitLabel={editing ? 'Guardar cambios' : 'Registrar equipo'}
          onSubmit={handleSave}
          onCancel={() => { setFormOpen(false); setEditing(null); }}
        />
      </Modal>
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Eliminar equipo"
        message={deleteTarget ? `¿Deseas eliminar “${deleteTarget.name}”? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
        loading={deleting}
      />
    </section>
  );
}
