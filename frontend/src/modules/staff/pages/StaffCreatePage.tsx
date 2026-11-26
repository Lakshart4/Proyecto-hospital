import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { useApi } from '../../../shared/hooks/useApi';
import { MESSAGES } from '../../../shared/lib/messages';
import { createStaff, listDepartments, type StaffPayload } from '../api';
import { StaffForm } from '../components/StaffForm';

export function StaffCreatePage() {
  const navigate = useNavigate();
  const deptQuery = useApi((signal) => listDepartments(signal), []);
  const [created, setCreated] = useState<{ id: number; name: string; initialPassword: string } | null>(null);

  const handleSubmit = async (payload: StaffPayload) => {
    const result = await createStaff(payload);
    setCreated({ id: result.profile.id, name: result.profile.name, initialPassword: result.initialPassword });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">{MESSAGES.nav.staff}</h1>
          <p className="text-sm text-muted">{MESSAGES.staff.newTitle}</p>
        </div>
        <Link to="/personal" className="text-sm font-medium text-primary hover:underline">
          {MESSAGES.staff.backToList}
        </Link>
      </div>

      {deptQuery.error && <ErrorBanner message={deptQuery.error.message} />}

      {deptQuery.loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner />
          <span className="text-sm text-muted">{MESSAGES.common.loading}</span>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-page p-6">
          <StaffForm
            departments={deptQuery.data ?? []}
            submitLabel={MESSAGES.staff.createSubmit}
            onSubmit={handleSubmit}
            onCancel={() => navigate('/personal')}
          />
        </div>
      )}

      <Modal
        open={created !== null}
        title={MESSAGES.staff.initialPasswordTitle}
        onClose={() => created && navigate(`/personal/${created.id}`)}
        footer={
          created && (
            <>
              <Button variant="secondary" onClick={() => navigate('/personal')}>
                {MESSAGES.staff.backToList}
              </Button>
              <Button onClick={() => navigate(`/personal/${created.id}`)}>Ir al perfil</Button>
            </>
          )
        }
      >
        {created && (
          <div className="flex flex-col gap-3">
            <p className="text-ink">
              Se registró a <strong>{created.name}</strong>.
            </p>
            <p className="text-muted">{MESSAGES.staff.initialPasswordNotice}</p>
            <div className="rounded-md border border-border bg-active p-3 text-center font-mono text-lg font-bold text-heading select-all">
              {created.initialPassword}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
