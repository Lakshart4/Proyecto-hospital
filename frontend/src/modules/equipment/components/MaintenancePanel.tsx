import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { formatDate } from '../../../shared/lib/formatters';
import { listDepartments, listEquipment, listMaintenance } from '../api';
import { MAINTENANCE_TYPES, type MaintenanceRecord, type MaintenanceType } from '../types';
import { CloseMaintenanceDialog } from './CloseMaintenanceDialog';
import { EmptyState, LoadingState, PaginationControls } from './LoadingState';
import { OpenMaintenanceDialog } from './OpenMaintenanceDialog';

export function MaintenancePanel() {
  const [equipmentId, setEquipmentId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [type, setType] = useState<MaintenanceType | ''>('');
  const [openFilter, setOpenFilter] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeTarget, setCloseTarget] = useState<MaintenanceRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const rangeInvalid = from !== '' && to !== '' && from > to;

  const equipmentQuery = useApi((signal) => listEquipment({}, signal), []);
  const departmentsQuery = useApi((signal) => listDepartments(signal), []);
  const maintenanceQuery = useApi(
    (signal) => listMaintenance({
      equipmentId: equipmentId ? Number(equipmentId) : undefined,
      departmentId: departmentId ? Number(departmentId) : undefined,
      type: type || undefined,
      open: openFilter === '' ? undefined : openFilter === 'true',
      from: from || undefined,
      to: to || undefined,
      page,
      pageSize,
    }, signal),
    [equipmentId, departmentId, type, openFilter, from, to, page, pageSize],
    { enabled: !rangeInvalid },
  );

  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const result = maintenanceQuery.data;
  const rows = result?.data ?? [];

  const resetFilters = () => {
    setEquipmentId('');
    setDepartmentId('');
    setType('');
    setOpenFilter('');
    setFrom('');
    setTo('');
    setPage(1);
  };

  return (
    <section aria-label="Registros de mantenimiento" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Registra intervenciones y cierra las que están en curso.</p>
        <Button onClick={() => setOpenDialog(true)} disabled={!equipmentQuery.data?.length}>Registrar mantenimiento</Button>
      </div>

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-page p-4 md:grid-cols-2 xl:grid-cols-3">
        <select aria-label="Filtrar mantenimiento por equipo" value={equipmentId} onChange={(event) => changeFilter(setEquipmentId, event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todos los equipos</option>
          {(equipmentQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select aria-label="Filtrar mantenimiento por departamento" value={departmentId} onChange={(event) => changeFilter(setDepartmentId, event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todos los departamentos</option>
          {(departmentsQuery.data ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <select aria-label="Filtrar por tipo de mantenimiento" value={type} onChange={(event) => changeFilter((value) => setType(value as MaintenanceType | ''), event.target.value)} className={INPUT_CLASSES}>
          <option value="">Todos los tipos</option>
          {MAINTENANCE_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select aria-label="Filtrar por situación del mantenimiento" value={openFilter} onChange={(event) => changeFilter(setOpenFilter, event.target.value)} className={INPUT_CLASSES}>
          <option value="">En curso y cerrados</option>
          <option value="true">En curso</option>
          <option value="false">Cerrados</option>
        </select>
        <label className="text-sm text-ink">Desde<input type="date" aria-label="Fecha inicial de mantenimiento" value={from} onChange={(event) => changeFilter(setFrom, event.target.value)} className={`${INPUT_CLASSES} mt-1`} /></label>
        <label className="text-sm text-ink">Hasta<input type="date" aria-label="Fecha final de mantenimiento" value={to} onChange={(event) => changeFilter(setTo, event.target.value)} className={`${INPUT_CLASSES} mt-1`} /></label>
        <div className="md:col-span-2 xl:col-span-3">
          <Button variant="secondary" onClick={resetFilters}>Limpiar filtros</Button>
        </div>
      </div>

      {rangeInvalid && <ErrorBanner message="La fecha inicial no puede ser posterior a la fecha final." />}
      {equipmentQuery.error && <ErrorBanner title="No se pudo cargar la lista de equipos" message={equipmentQuery.error.message} />}
      {maintenanceQuery.error && <ErrorBanner title="No se pudo cargar el mantenimiento" message={maintenanceQuery.error.message} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} durationMs={4000} />}

      {rangeInvalid ? null : maintenanceQuery.loading && !result ? (
        <LoadingState message="Cargando mantenimientos…" />
      ) : maintenanceQuery.error ? null : rows.length === 0 ? (
        <EmptyState title="No hay mantenimientos" message="No hay registros que cumplan todos los filtros seleccionados." />
      ) : (
        <>
          {maintenanceQuery.loading && <p role="status" className="text-sm text-muted">Actualizando mantenimientos…</p>}
          <div className="w-full overflow-x-auto rounded-lg border border-border bg-page">
            <table className="min-w-[1050px] w-full divide-y divide-border text-left text-sm">
              <caption className="sr-only">Registros de mantenimiento de equipos</caption>
              <thead className="bg-active text-heading">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Equipo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Departamento</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Tipo</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Inicio</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Fin</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Técnico y descripción</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Situación</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-3 font-medium text-ink">{record.equipment.name}</td>
                    <td className="px-4 py-3 text-ink">{record.equipment.department.name}</td>
                    <td className="px-4 py-3 capitalize text-ink">{record.type}</td>
                    <td className="px-4 py-3 text-ink">{formatDate(record.startDate)}</td>
                    <td className="px-4 py-3 text-ink">{record.endDate ? formatDate(record.endDate) : '—'}</td>
                    <td className="max-w-xs px-4 py-3 text-ink"><p className="font-medium">{record.technician}</p><p className="mt-1 whitespace-normal text-muted">{record.description}</p></td>
                    <td className="px-4 py-3">{record.endDate === null ? <StatusBadge value="En curso" tone="warning" /> : <StatusBadge value={record.resultingStatus ?? 'Cerrado'} />}</td>
                    <td className="px-4 py-3">{record.endDate === null ? <Button variant="secondary" onClick={() => setCloseTarget(record)}>Cerrar</Button> : <span className="text-muted">Sin acciones</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-center gap-2 text-sm text-ink">Registros por página
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-page px-2 py-1">
                {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            {result && <PaginationControls page={result.page} pageSize={result.pageSize} total={result.total} onPageChange={setPage} disabled={maintenanceQuery.loading} />}
          </div>
        </>
      )}

      <OpenMaintenanceDialog
        key={openDialog ? 'open' : 'closed'}
        open={openDialog}
        equipment={equipmentQuery.data ?? []}
        onClose={() => setOpenDialog(false)}
        onOpened={() => {
          setOpenDialog(false);
          setPage(1);
          maintenanceQuery.reload();
          equipmentQuery.reload();
          setToast('Mantenimiento registrado y equipo actualizado.');
        }}
      />
      <CloseMaintenanceDialog
        record={closeTarget}
        onClose={() => setCloseTarget(null)}
        onClosed={() => {
          setCloseTarget(null);
          maintenanceQuery.reload();
          equipmentQuery.reload();
          setToast('Mantenimiento cerrado correctamente.');
        }}
      />
    </section>
  );
}
