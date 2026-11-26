import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminAuthDialog } from '../../../shared/components/AdminAuthDialog';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { Toast } from '../../../shared/components/Toast';
import { useAdminAuth } from '../../../shared/hooks/useAdminAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import { formatDate } from '../../../shared/lib/formatters';
import { MESSAGES } from '../../../shared/lib/messages';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import {
  deleteEmployeeDocument,
  downloadPdf,
  listEmployeeDocuments,
  replaceEmployeeDocument,
  uploadEmployeeDocument,
} from '../api';
import { DOCUMENT_TYPES, documentMetaSchema, type DocumentFormValues } from '../schemas';
import type { DocumentType, EmployeeDocument } from '../types';

const DOC_FIELDS = ['type', 'title', 'issuedAt', 'expiresAt', 'file'] as const;
type DocField = (typeof DOC_FIELDS)[number];

export interface EmployeeDocumentsPanelProps {
  employeeId: number;
}

/** Pestaña de gestión de documentos en `/personal/:id` con Autorización_Administrativa (Req. 18.9, 19.2). */
export function EmployeeDocumentsPanel({ employeeId }: EmployeeDocumentsPanelProps) {
  const adminAuth = useAdminAuth();
  const { withAdminAuth } = adminAuth;

  const [docs, setDocs] = useState<EmployeeDocument[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [modalMode, setModalMode] = useState<{ kind: 'upload' } | { kind: 'replace'; doc: EmployeeDocument } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await withAdminAuth(() => listEmployeeDocuments(employeeId));
      setDocs(data);
    } catch (reason) {
      setError(toApiError(reason).message);
      setDocs(null);
    } finally {
      setLoading(false);
    }
  }, [employeeId, withAdminAuth]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDownload = async (doc: EmployeeDocument) => {
    setError(null);
    try {
      await withAdminAuth(() => downloadPdf(`/documents/${doc.id}/file`, `documento-${doc.id}.pdf`));
    } catch (reason) {
      setError(toApiError(reason).message);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      const target = deleteTarget;
      await withAdminAuth(() => deleteEmployeeDocument(target.id));
      setDeleteTarget(null);
      setToast(MESSAGES.documents.deleted);
      await load();
    } catch (reason) {
      setError(toApiError(reason).message);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-heading">{MESSAGES.documents.title}</h2>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => void load()} disabled={loading}>
            Actualizar
          </Button>
          <Button onClick={() => setModalMode({ kind: 'upload' })}>{MESSAGES.documents.uploadButton}</Button>
        </div>
      </div>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} />}

      {loading ? (
        <div className="flex items-center gap-2 py-6">
          <Spinner />
          <span className="text-sm text-muted">{MESSAGES.common.loading}</span>
        </div>
      ) : docs && docs.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted">{MESSAGES.documents.empty}</p>
      ) : docs ? (
        <div className="w-full overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-active">
              <tr>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.titleLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.typeLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.issuedAtLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.expiresAtLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">Estado</th>
                <th className="px-4 py-3 font-semibold text-heading">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-page">
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-4 py-3 font-medium text-ink">{doc.title}</td>
                  <td className="px-4 py-3 text-ink">{MESSAGES.documents.types[doc.type]}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink">{formatDate(doc.issuedAt)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink">{doc.expiresAt ? formatDate(doc.expiresAt) : '—'}</td>
                  <td className="px-4 py-3">
                    {doc.expired ? (
                      <StatusBadge value={MESSAGES.documents.expiredBadge} tone="danger" />
                    ) : (
                      <StatusBadge value={MESSAGES.documents.validBadge} tone="success" />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void handleDownload(doc)}>
                        {MESSAGES.documents.downloadButton}
                      </Button>
                      <Button variant="secondary" onClick={() => setModalMode({ kind: 'replace', doc })}>
                        {MESSAGES.documents.replaceButton}
                      </Button>
                      <Button variant="danger" onClick={() => setDeleteTarget(doc)}>
                        {MESSAGES.documents.deleteButton}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {modalMode && (
        <DocumentModal
          mode={modalMode}
          employeeId={employeeId}
          withAdminAuth={withAdminAuth}
          onClose={() => setModalMode(null)}
          onSaved={async (msg) => {
            setModalMode(null);
            setToast(msg);
            await load();
          }}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        message={deleteTarget ? MESSAGES.documents.deleteConfirm(deleteTarget.title) : ''}
        onConfirm={() => void handleDelete()}
        onCancel={() => !deleting && setDeleteTarget(null)}
        loading={deleting}
      />

      <AdminAuthDialog {...adminAuth.dialog} />
    </div>
  );
}

interface DocumentModalProps {
  mode: { kind: 'upload' } | { kind: 'replace'; doc: EmployeeDocument };
  employeeId: number;
  withAdminAuth: <T>(run: () => Promise<T>) => Promise<T>;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}

function DocumentModal({ mode, employeeId, withAdminAuth, onClose, onSaved }: DocumentModalProps) {
  const existing = mode.kind === 'replace' ? mode.doc : null;
  const [values, setValues] = useState<DocumentFormValues>({
    type: existing?.type ?? 'contratación',
    title: existing?.title ?? '',
    issuedAt: existing?.issuedAt ?? '',
    expiresAt: existing?.expiresAt ?? '',
  });
  const [file, setFile] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<DocField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(documentMetaSchema, values);
    const nextErrors: FieldErrors<DocField> = checked.ok ? {} : { ...checked.fieldErrors };
    if (mode.kind === 'upload' && file === null) {
      nextErrors.file = 'Debes seleccionar un archivo PDF.';
    }
    if (Object.keys(nextErrors).length > 0 || !checked.ok) {
      setFieldErrors(nextErrors);
      setFormError(null);
      return;
    }

    const form = new FormData();
    form.append('type', checked.data.type);
    form.append('title', checked.data.title.trim());
    form.append('issuedAt', checked.data.issuedAt.trim());
    if (checked.data.expiresAt.trim() !== '') form.append('expiresAt', checked.data.expiresAt.trim());
    if (file !== null) form.append('file', file);

    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      if (mode.kind === 'upload') {
        await withAdminAuth(() => uploadEmployeeDocument(employeeId, form));
        await onSaved(MESSAGES.documents.uploaded);
      } else {
        await withAdminAuth(() => replaceEmployeeDocument(mode.doc.id, form));
        await onSaved(MESSAGES.documents.replaced);
      }
    } catch (reason) {
      const mapped = mapApiError(reason, DOC_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open
      title={mode.kind === 'upload' ? MESSAGES.documents.uploadButton : MESSAGES.documents.replaceButton}
      onClose={() => !submitting && onClose()}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            {MESSAGES.common.cancel}
          </Button>
          <Button type="submit" form="employee-doc-form" loading={submitting}>
            {MESSAGES.staff.save}
          </Button>
        </>
      }
    >
      <form id="employee-doc-form" onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && <ErrorBanner message={formError} />}
        <FormField id="doc-type" label={MESSAGES.documents.typeLabel} error={fieldErrors.type} required>
          <select
            value={values.type}
            onChange={(e) => setValues((p) => ({ ...p, type: e.target.value as DocumentType }))}
            disabled={submitting}
            className={INPUT_CLASSES}
          >
            {DOCUMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {MESSAGES.documents.types[t]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="doc-title" label={MESSAGES.documents.titleLabel} error={fieldErrors.title} required>
          <input value={values.title} onChange={(e) => setValues((p) => ({ ...p, title: e.target.value }))} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="doc-issuedAt" label={MESSAGES.documents.issuedAtLabel} error={fieldErrors.issuedAt} required>
          <input type="date" value={values.issuedAt} onChange={(e) => setValues((p) => ({ ...p, issuedAt: e.target.value }))} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="doc-expiresAt" label={MESSAGES.documents.expiresAtLabel} error={fieldErrors.expiresAt}>
          <input type="date" value={values.expiresAt} onChange={(e) => setValues((p) => ({ ...p, expiresAt: e.target.value }))} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField
          id="doc-file"
          label={MESSAGES.documents.fileLabel}
          error={fieldErrors.file}
          required={mode.kind === 'upload'}
          hint={mode.kind === 'replace' ? MESSAGES.documents.replaceFileHint : undefined}
        >
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={submitting}
            className={INPUT_CLASSES}
          />
        </FormField>
      </form>
    </Modal>
  );
}
