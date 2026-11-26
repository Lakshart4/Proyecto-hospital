import { useState, type ChangeEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../../shared/components/Avatar';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Tabs, type TabItem } from '../../../shared/components/Tabs';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { MESSAGES } from '../../../shared/lib/messages';
import { deleteStaff, getStaff, listDepartments, updateStaff, uploadStaffPhoto, type StaffPayload } from '../api';
import { EmployeeDocumentsPanel } from '../components/EmployeeDocumentsPanel';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { StaffForm } from '../components/StaffForm';
import type { EmployeeRole } from '../types';

type DetailTab = 'profile' | 'schedule' | 'documents';

const TABS: readonly TabItem<DetailTab>[] = [
  { id: 'profile', label: MESSAGES.staff.tabs.profile },
  { id: 'schedule', label: MESSAGES.staff.tabs.schedule },
  { id: 'documents', label: MESSAGES.staff.tabs.documents },
];

export function StaffDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const numericId = Number(id);
  const validId = Number.isInteger(numericId) && numericId > 0;

  const [activeTab, setActiveTab] = useState<DetailTab>('profile');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const staffQuery = useApi((signal) => getStaff(numericId, signal), [numericId], { enabled: validId });
  const deptQuery = useApi((signal) => listDepartments(signal), []);

  const profile = staffQuery.data;

  const handleUpdate = async (payload: StaffPayload) => {
    await updateStaff(numericId, payload);
    setToast(MESSAGES.staff.saved);
    staffQuery.reload();
  };

  const handlePhotoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || uploadingPhoto) return;
    setUploadingPhoto(true);
    setActionError(null);
    try {
      await uploadStaffPhoto(numericId, file);
      setToast(MESSAGES.staff.photoUpdated);
      staffQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteStaff(numericId);
      navigate('/personal', { replace: true });
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">{MESSAGES.nav.staff}</h1>
          {profile && <p className="text-sm text-muted">{profile.name}</p>}
        </div>
        <Link to="/personal" className="text-sm font-medium text-primary hover:underline">
          {MESSAGES.staff.backToList}
        </Link>
      </div>

      {!validId && <ErrorBanner message={MESSAGES.api.notFound} />}
      {staffQuery.error && <ErrorBanner message={staffQuery.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      {staffQuery.loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner />
          <span className="text-sm text-muted">{MESSAGES.common.loading}</span>
        </div>
      ) : profile ? (
        <>
          <div className="flex flex-col gap-4 rounded-lg border border-border bg-page p-6 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col items-start gap-4 md:flex-row md:items-center">
              <Avatar src={profile.photoUrl} alt={profile.name} size="lg" />
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl font-semibold text-heading">{profile.name}</h2>
                  <StatusBadge value={MESSAGES.roles[profile.role]} tone="info" />
                </div>
                <p className="text-sm text-ink">
                  {profile.position} · {profile.department.name} · {MESSAGES.staff.shifts[profile.shift]}
                </p>
                {profile.description && <p className="text-sm text-muted">{profile.description}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-md border border-border bg-page px-3 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:bg-active">
                {uploadingPhoto ? MESSAGES.common.loading : MESSAGES.staff.uploadPhoto}
                <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(e) => void handlePhotoUpload(e)} disabled={uploadingPhoto} className="sr-only" />
              </label>
              <Button variant="danger" onClick={() => setConfirmDelete(true)}>
                {MESSAGES.staff.deleteButton}
              </Button>
            </div>
          </div>

          <Tabs tabs={TABS} active={activeTab} onChange={setActiveTab} label={MESSAGES.nav.staff} />

          {activeTab === 'profile' && (
            <div className="rounded-lg border border-border bg-page p-6">
              <StaffForm
                departments={deptQuery.data ?? [profile.department]}
                initial={{
                  internalId: profile.internalId,
                  email: profile.email,
                  role: (profile.role === 'ADMIN' ? 'DOCTOR' : profile.role) as EmployeeRole,
                  name: profile.name,
                  position: profile.position,
                  description: profile.description,
                  specialty: profile.specialty,
                  departmentId: String(profile.departmentId),
                  yearsExperience: String(profile.yearsExperience),
                  shift: profile.shift,
                  phone: profile.phone,
                  birthDate: profile.birthDate ?? '',
                }}
                submitLabel={MESSAGES.staff.save}
                onSubmit={handleUpdate}
              />
            </div>
          )}

          {activeTab === 'schedule' && (
            <div className="rounded-lg border border-border bg-page p-6">
              <ScheduleEditor userId={profile.id} schedule={profile.schedule} onSaved={() => staffQuery.reload()} />
            </div>
          )}

          {activeTab === 'documents' && (
            <div className="rounded-lg border border-border bg-page p-6">
              <EmployeeDocumentsPanel employeeId={profile.id} />
            </div>
          )}

          <ConfirmDialog
            open={confirmDelete}
            message={MESSAGES.staff.deleteConfirm(profile.name)}
            onConfirm={() => void handleDelete()}
            onCancel={() => !deleting && setConfirmDelete(false)}
            loading={deleting}
          />
        </>
      ) : null}
    </div>
  );
}
