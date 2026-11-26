import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CHANGE_PASSWORD_PATH } from '../../../app/navigation';
import { Avatar } from '../../../shared/components/Avatar';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import { MESSAGES } from '../../../shared/lib/messages';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { getStaff, patchOwnProfile, uploadStaffPhoto } from '../api';
import { ScheduleEditor } from '../components/ScheduleEditor';
import { ownPhoneSchema } from '../schemas';

const PHONE_FIELDS = ['phone'] as const;

export function ProfilePage() {
  const { user } = useAuth();
  const profileQuery = useApi((signal) => getStaff(user!.id, signal), [user?.id], { enabled: user !== null });
  const profile = profileQuery.data;

  const [phone, setPhone] = useState('');
  const [phoneErrors, setPhoneErrors] = useState<FieldErrors<'phone'>>({});
  const [phoneFormError, setPhoneFormError] = useState<string | null>(null);
  const [savingPhone, setSavingPhone] = useState(false);

  const [photoBusy, setPhotoBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (profile) setPhone(profile.phone);
  }, [profile]);

  const handlePhoneSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (savingPhone) return;
    const checked = validateForm(ownPhoneSchema, { phone });
    if (!checked.ok) {
      setPhoneErrors(checked.fieldErrors);
      setPhoneFormError(null);
      return;
    }
    setPhoneErrors({});
    setPhoneFormError(null);
    setSavingPhone(true);
    try {
      await patchOwnProfile({ phone: checked.data.phone.trim() });
      setToast(MESSAGES.staff.phoneUpdated);
      profileQuery.reload();
    } catch (reason) {
      const mapped = mapApiError(reason, PHONE_FIELDS);
      setPhoneErrors(mapped.fieldErrors);
      setPhoneFormError(mapped.formError);
    } finally {
      setSavingPhone(false);
    }
  };

  const handlePhotoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user || photoBusy) return;
    setPhotoBusy(true);
    setActionError(null);
    try {
      await uploadStaffPhoto(user.id, file);
      setToast(MESSAGES.staff.photoUpdated);
      profileQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    setActionError(null);
    try {
      await patchOwnProfile({ photoUrl: null });
      setToast(MESSAGES.staff.photoUpdated);
      profileQuery.reload();
    } catch (reason) {
      setActionError(toApiError(reason).message);
    } finally {
      setPhotoBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-heading">{MESSAGES.nav.profile}</h1>

      {profileQuery.error && <ErrorBanner message={profileQuery.error.message} />}
      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      {profileQuery.loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner />
          <span className="text-sm text-muted">{MESSAGES.common.loading}</span>
        </div>
      ) : profile ? (
        <>
          {/* Vista de Perfil en una columna bajo 768 px (Req. 15.17) */}
          <div className="grid grid-cols-1 gap-6 rounded-lg border border-border bg-page p-6 md:grid-cols-3">
            <div className="flex flex-col items-center gap-3 text-center">
              <Avatar src={profile.photoUrl} alt={profile.name} size="lg" />
              <div className="flex flex-wrap justify-center gap-2">
                <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-semibold text-page transition-colors duration-200 hover:bg-heading">
                  {photoBusy ? MESSAGES.common.loading : MESSAGES.staff.uploadPhoto}
                  <input type="file" accept="image/jpeg,image/png,.jpg,.jpeg,.png" onChange={(e) => void handlePhotoChange(e)} disabled={photoBusy} className="sr-only" />
                </label>
                {profile.photoUrl !== '/avatars/default.svg' && (
                  <Button variant="secondary" onClick={() => void handleRemovePhoto()} disabled={photoBusy}>
                    {MESSAGES.staff.removePhoto}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted">{MESSAGES.staff.photoHint}</p>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-semibold text-heading">{profile.name}</h2>
                <StatusBadge value={MESSAGES.roles[profile.role]} tone="info" />
              </div>
              <dl className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                <div>
                  <dt className="text-muted">{MESSAGES.staff.fields.position}</dt>
                  <dd className="font-medium text-ink">{profile.position}</dd>
                </div>
                <div>
                  <dt className="text-muted">{MESSAGES.staff.fields.department}</dt>
                  <dd className="font-medium text-ink">{profile.department.name}</dd>
                </div>
                <div>
                  <dt className="text-muted">{MESSAGES.staff.fields.shift}</dt>
                  <dd className="font-medium text-ink">{MESSAGES.staff.shifts[profile.shift]}</dd>
                </div>
                <div>
                  <dt className="text-muted">{MESSAGES.staff.fields.specialty}</dt>
                  <dd className="font-medium text-ink">{profile.specialty}</dd>
                </div>
                <div>
                  <dt className="text-muted">{MESSAGES.staff.fields.internalId}</dt>
                  <dd className="font-medium text-ink">{profile.internalId}</dd>
                </div>
                <div>
                  <dt className="text-muted">{MESSAGES.staff.fields.email}</dt>
                  <dd className="font-medium text-ink">{profile.email}</dd>
                </div>
              </dl>
              {profile.description && (
                <div className="mt-1 text-sm">
                  <p className="text-muted">{MESSAGES.staff.fields.description}</p>
                  <p className="text-ink">{profile.description}</p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-3">
                <Link to={CHANGE_PASSWORD_PATH} className="text-sm font-medium text-primary hover:underline">
                  {MESSAGES.staff.changePasswordLink}
                </Link>
                {profile.role !== 'ADMIN' && (
                  <Link to="/perfil/documentos" className="text-sm font-medium text-primary hover:underline">
                    {MESSAGES.staff.viewOwnDocuments}
                  </Link>
                )}
              </div>
            </div>
          </div>

          {profile.role !== 'ADMIN' && (
            <form onSubmit={handlePhoneSubmit} noValidate className="flex flex-col gap-3 rounded-lg border border-border bg-page p-6">
              <h2 className="text-lg font-semibold text-heading">{MESSAGES.staff.fields.phone}</h2>
              {phoneFormError && <ErrorBanner message={phoneFormError} onDismiss={() => setPhoneFormError(null)} />}
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1">
                  <FormField id="own-phone" label={MESSAGES.staff.fields.phone} error={phoneErrors.phone} required>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} disabled={savingPhone} className={INPUT_CLASSES} />
                  </FormField>
                </div>
                <Button type="submit" loading={savingPhone}>
                  {MESSAGES.staff.save}
                </Button>
              </div>
            </form>
          )}

          <div className="rounded-lg border border-border bg-page p-6">
            <ScheduleEditor userId={profile.id} schedule={profile.schedule} onSaved={() => profileQuery.reload()} />
          </div>
        </>
      ) : null}
    </div>
  );
}
