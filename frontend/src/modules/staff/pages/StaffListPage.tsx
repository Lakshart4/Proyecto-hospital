import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../../shared/components/Avatar';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { DataTable, type DataTableColumn } from '../../../shared/components/DataTable';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { SearchBox } from '../../../shared/components/SearchBox';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { MESSAGES } from '../../../shared/lib/messages';
import { deleteStaff, listDepartments, listStaff } from '../api';
import { EMPLOYEE_ROLES, SHIFTS } from '../schemas';
import type { EmployeeRole, Shift, StaffListItem } from '../types';

export function StaffListPage() {
  const [role, setRole] = useState<EmployeeRole | ''>('');
  const [departmentId, setDepartmentId] = useState<string>('');
  const [shift, setShift] = useState<Shift | ''>('');
  const [search, setSearch] = useState('');

  const [deleteTarget, setDeleteTarget] = useState<StaffListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const deptQuery = useApi((signal) => listDepartments(signal), []);
  const staffQuery = useApi(
    (signal) =>
      listStaff(
        {
          role,
          departmentId: departmentId === '' ? '' : Number(departmentId),
          shift,
          search,
        },
        signal,
      ),
    [role, departmentId, shift, search],
  );

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteStaff(deleteTarget.id);
      setDeleteTarget(null);
      setToast(MESSAGES.staff.deleted);
      staffQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const columns: readonly DataTableColumn<StaffListItem>[] = [
    {
      key: 'name',
      header: MESSAGES.staff.fields.name,
      sortValue: (row) => row.name,
      render: (row) => (
        <div className="flex items-center gap-3">
          <Avatar src={row.photoUrl} alt={row.name} size="sm" />
          <Link to={`/personal/${row.id}`} className="font-medium text-primary hover:underline">
            {row.name}
          </Link>
        </div>
      ),
    },
    { key: 'internalId', header: MESSAGES.staff.fields.internalId, sortValue: (row) => row.internalId },
    {
      key: 'role',
      header: MESSAGES.staff.fields.role,
      sortValue: (row) => MESSAGES.roles[row.role],
      render: (row) => <StatusBadge value={MESSAGES.roles[row.role]} tone="info" />,
    },
    { key: 'department', header: MESSAGES.staff.fields.department, sortValue: (row) => row.department.name },
    {
      key: 'shift',
      header: MESSAGES.staff.fields.shift,
      sortValue: (row) => MESSAGES.staff.shifts[row.shift],
      render: (row) => MESSAGES.staff.shifts[row.shift],
    },
    { key: 'position', header: MESSAGES.staff.fields.position, sortValue: (row) => row.position },
    {
      key: 'actions',
      header: 'Acciones',
      render: (row) => (
        <div className="flex items-center gap-2">
          <Link to={`/personal/${row.id}`} className="text-sm font-medium text-primary hover:underline">
            Ver detalle
          </Link>
          <Button variant="danger" onClick={() => setDeleteTarget(row)}>
            {MESSAGES.documents.deleteButton}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-heading">{MESSAGES.nav.staff}</h1>
        <Link
          to="/personal/nuevo"
          className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-semibold text-page transition-colors duration-200 hover:bg-heading"
        >
          {MESSAGES.staff.newButton}
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <SearchBox value={search} onChange={setSearch} placeholder="Buscar por nombre o ID interno…" />
        <select aria-label={MESSAGES.staff.fields.role} value={role} onChange={(e) => setRole(e.target.value as EmployeeRole | '')} className={INPUT_CLASSES}>
          <option value="">{MESSAGES.staff.allRoles}</option>
          {EMPLOYEE_ROLES.map((r) => (
            <option key={r} value={r}>
              {MESSAGES.roles[r]}
            </option>
          ))}
        </select>
        <select aria-label={MESSAGES.staff.fields.department} value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className={INPUT_CLASSES}>
          <option value="">{MESSAGES.staff.allDepartments}</option>
          {(deptQuery.data ?? []).map((dept) => (
            <option key={dept.id} value={String(dept.id)}>
              {dept.name}
            </option>
          ))}
        </select>
        <select aria-label={MESSAGES.staff.fields.shift} value={shift} onChange={(e) => setShift(e.target.value as Shift | '')} className={INPUT_CLASSES}>
          <option value="">{MESSAGES.staff.allShifts}</option>
          {SHIFTS.map((s) => (
            <option key={s} value={s}>
              {MESSAGES.staff.shifts[s]}
            </option>
          ))}
        </select>
      </div>

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {staffQuery.error && <ErrorBanner message={staffQuery.error.message} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      {staffQuery.loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner />
          <span className="text-sm text-muted">{MESSAGES.common.loading}</span>
        </div>
      ) : (
        <DataTable columns={columns} rows={staffQuery.data ?? []} rowKey={(row) => row.id} caption={MESSAGES.nav.staff} />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        message={deleteTarget ? MESSAGES.staff.deleteConfirm(deleteTarget.name) : ''}
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
