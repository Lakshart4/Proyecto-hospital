import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { useApi } from '../../../shared/hooks/useApi';
import { formatDateTime } from '../../../shared/lib/formatters';
import { listAudit } from '../api';
import { AUDIT_ACTIONS, type AuditLog } from '../types';

const ACTION_LABELS: Readonly<Record<string, string>> = {
  LOGIN_SUCCESS: 'Inicio de sesión exitoso',
  LOGIN_FAILURE: 'Inicio de sesión fallido',
  PASSWORD_RESET_REQUEST: 'Solicitud de restablecimiento',
  PASSWORD_RESET_COMPLETE: 'Contraseña restablecida',
  PASSWORD_CHANGE: 'Cambio de contraseña',
  ADMIN_AUTH_GRANTED: 'Autorización administrativa otorgada',
  ADMIN_AUTH_REJECTED: 'Autorización administrativa rechazada',
  DOCUMENT_READ: 'Consulta de documento',
  DOCUMENT_DOWNLOAD: 'Descarga de documento',
  DOCUMENT_UPLOAD: 'Carga de documento',
  DOCUMENT_REPLACE: 'Reemplazo de documento',
  DOCUMENT_DELETE: 'Eliminación de documento',
  PROFILE_DETAIL_READ: 'Consulta de perfil',
  EMPLOYEE_CREATE: 'Creación de empleado',
  EMPLOYEE_DELETE: 'Eliminación de empleado',
  EMPLOYEE_UPDATE: 'Actualización de empleado',
  ROLE_CHANGE: 'Cambio de rol',
  PATIENT_STATUS_CHANGE: 'Cambio de estado del paciente',
  PATIENT_ADMISSION: 'Ingreso de paciente',
  PATIENT_READMISSION: 'Reingreso de paciente',
  ROOM_ASSIGN: 'Asignación de habitación',
  ROOM_RELEASE: 'Liberación de habitación',
  INVENTORY_MOVEMENT: 'Movimiento de inventario',
  DELIVERY_RECEIVE: 'Recepción de entrega',
  DELIVERY_CANCEL: 'Cancelación de entrega',
  EQUIPMENT_STATUS_CHANGE: 'Cambio de estado de equipo',
  MAINTENANCE_OPEN: 'Apertura de mantenimiento',
  MAINTENANCE_CLOSE: 'Cierre de mantenimiento',
};

const ENTITY_LABELS: Readonly<Record<string, string>> = {
  User: 'Usuario',
  Session: 'Sesión',
  Employee: 'Empleado',
  EmployeeDocument: 'Documento de empleado',
  Patient: 'Paciente',
  Room: 'Habitación',
  Product: 'Producto',
  SupplierDelivery: 'Entrega de proveedor',
  Equipment: 'Equipo',
  MaintenanceRecord: 'Registro de mantenimiento',
};

interface AppliedFilters {
  userId: string;
  action: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: AppliedFilters = { userId: '', action: '', from: '', to: '' };

function detailsText(log: AuditLog): string {
  if (log.details === null || log.details === '') return 'Sin detalles';
  if (typeof log.details !== 'string') return JSON.stringify(log.details, null, 2);
  try {
    return JSON.stringify(JSON.parse(log.details) as unknown, null, 2);
  } catch {
    return log.details;
  }
}

function userLabel(log: AuditLog): string {
  return log.user?.name ?? log.userName ?? (log.userId === null ? 'No identificado' : `Usuario #${log.userId}`);
}

export function AuditPage() {
  const [draft, setDraft] = useState<AppliedFilters>(EMPTY_FILTERS);
  const [filters, setFilters] = useState<AppliedFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterError, setFilterError] = useState<string | null>(null);

  const auditQuery = useApi(
    (signal) => listAudit({
      userId: filters.userId ? Number(filters.userId) : undefined,
      action: filters.action || undefined,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page,
      pageSize,
    }, signal),
    [filters.userId, filters.action, filters.from, filters.to, page, pageSize],
  );

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) {
      setFilterError('La fecha inicial no puede ser posterior a la fecha final.');
      return;
    }
    if (draft.userId && (!/^\d+$/.test(draft.userId) || Number(draft.userId) < 1)) {
      setFilterError('El ID de usuario debe ser un número entero positivo.');
      return;
    }
    setFilterError(null);
    setFilters({ ...draft });
    setPage(1);
  };

  const clearFilters = () => {
    setDraft(EMPTY_FILTERS);
    setFilters(EMPTY_FILTERS);
    setFilterError(null);
    setPage(1);
  };

  const result = auditQuery.data;
  const rows = result?.data ?? [];
  const pageCount = Math.max(1, Math.ceil((result?.total ?? 0) / pageSize));
  const first = !result || result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1;
  const last = result ? Math.min(result.page * result.pageSize, result.total) : 0;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold text-heading">Bitácora de auditoría</h1>
        <p className="mt-1 text-sm text-muted">Consulta los accesos y cambios sensibles, del más reciente al más antiguo.</p>
      </header>

      <form onSubmit={applyFilters} noValidate className="flex flex-col gap-4 rounded-lg border border-border bg-page p-4" aria-label="Filtros de auditoría">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label htmlFor="audit-user" className="text-sm font-medium text-ink">ID de usuario
            <input id="audit-user" type="number" min={1} step={1} inputMode="numeric" placeholder="Todos los usuarios" value={draft.userId} onChange={(event) => setDraft((current) => ({ ...current, userId: event.target.value }))} className={`${INPUT_CLASSES} mt-1`} />
          </label>
          <label htmlFor="audit-action" className="text-sm font-medium text-ink">Acción
            <select id="audit-action" value={draft.action} onChange={(event) => setDraft((current) => ({ ...current, action: event.target.value }))} className={`${INPUT_CLASSES} mt-1`}>
              <option value="">Todas las acciones</option>
              {AUDIT_ACTIONS.map((action) => <option key={action} value={action}>{ACTION_LABELS[action] ?? action}</option>)}
            </select>
          </label>
          <label htmlFor="audit-from" className="text-sm font-medium text-ink">Fecha inicial
            <input id="audit-from" type="date" value={draft.from} onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value }))} className={`${INPUT_CLASSES} mt-1`} />
          </label>
          <label htmlFor="audit-to" className="text-sm font-medium text-ink">Fecha final
            <input id="audit-to" type="date" value={draft.to} onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value }))} className={`${INPUT_CLASSES} mt-1`} />
          </label>
        </div>
        <p className="text-xs text-muted">Las fechas inicial y final son inclusivas. Todos los filtros se combinan.</p>
        {filterError && <ErrorBanner message={filterError} onDismiss={() => setFilterError(null)} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Aplicar filtros</Button>
          <Button variant="secondary" onClick={clearFilters}>Limpiar filtros</Button>
        </div>
      </form>

      {auditQuery.error && (
        <div className="flex flex-col items-start gap-3">
          <ErrorBanner title="No se pudo cargar la auditoría" message={auditQuery.error.message} />
          <Button variant="secondary" onClick={auditQuery.reload}>Reintentar</Button>
        </div>
      )}

      {auditQuery.loading && !result ? (
        <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-page py-12 text-sm text-muted">
          <Spinner label="Cargando auditoría…" /><span>Cargando auditoría…</span>
        </div>
      ) : auditQuery.error ? null : (
        <section aria-label="Registros de auditoría" className="flex flex-col gap-4">
          {auditQuery.loading && <p role="status" className="text-sm text-muted">Actualizando registros…</p>}
          <div className="w-full overflow-x-auto rounded-lg border border-border bg-page">
            <table className="min-w-[1000px] w-full divide-y divide-border text-left text-sm">
              <caption className="sr-only">Registros de la bitácora de auditoría</caption>
              <thead className="bg-active text-heading">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Fecha y hora</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Usuario</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Acción</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Entidad</th>
                  <th scope="col" className="px-4 py-3 font-semibold">ID de entidad</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-muted">No hay resultados</td></tr>
                ) : rows.map((log) => (
                  <tr key={log.id} className="align-top">
                    <td className="whitespace-nowrap px-4 py-3 text-ink"><time dateTime={log.createdAt}>{formatDateTime(log.createdAt)}</time></td>
                    <td className="px-4 py-3 text-ink">
                      <p className="font-medium">{userLabel(log)}</p>
                      {(log.user?.internalId || log.user?.email) && <p className="mt-1 text-xs text-muted">{log.user.internalId ?? log.user.email}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink">{ACTION_LABELS[log.action] ?? log.action}</td>
                    <td className="px-4 py-3 text-ink">{ENTITY_LABELS[log.entityType] ?? log.entityType}</td>
                    <td className="px-4 py-3 text-ink">{log.entityId ?? '—'}</td>
                    <td className="max-w-md px-4 py-3 text-ink">
                      <details>
                        <summary className="cursor-pointer font-medium text-primary">Ver detalles</summary>
                        <pre className="mt-2 max-h-56 max-w-sm overflow-auto whitespace-pre-wrap break-words rounded-md bg-active p-3 text-xs text-ink">{detailsText(log)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="flex items-center gap-2 text-sm text-ink">Registros por página
              <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }} className="rounded-md border border-border bg-page px-2 py-1">
                {[10, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
            </label>
            <span className="text-sm text-muted">Mostrando {first}–{last} de {result?.total ?? 0}</span>
          </div>
          {(result?.total ?? 0) > pageSize && (
            <nav aria-label="Paginación de auditoría" className="flex flex-wrap items-center justify-end gap-3 text-sm text-ink">
              <Button variant="secondary" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={!result || result.page <= 1 || auditQuery.loading}>Anterior</Button>
              <span>Página {result?.page ?? page} de {pageCount}</span>
              <Button variant="secondary" onClick={() => setPage((current) => current + 1)} disabled={!result || result.page >= pageCount || auditQuery.loading}>Siguiente</Button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}

export default AuditPage;
