import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { useApi } from '../../../shared/hooks/useApi';
import { toApiError } from '../../../shared/lib/apiClient';
import { formatDate } from '../../../shared/lib/formatters';
import { MESSAGES } from '../../../shared/lib/messages';
import { downloadPdf, listOwnDocuments } from '../api';
import type { EmployeeDocument } from '../types';

/** Apartado_Privado del Empleado: solo lectura y descarga de sus propios documentos (Req. 19.4, 19.9). */
export function PrivateDocumentsPage() {
  const docsQuery = useApi((signal) => listOwnDocuments(signal), []);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async (doc: EmployeeDocument) => {
    setDownloadError(null);
    try {
      await downloadPdf(`/me/documents/${doc.id}/file`, `documento-${doc.id}.pdf`);
    } catch (reason) {
      setDownloadError(toApiError(reason).message);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-heading">{MESSAGES.nav.ownDocuments}</h1>
          <p className="text-sm text-muted">{MESSAGES.documents.ownSubtitle}</p>
        </div>
        <Link to="/perfil" className="text-sm font-medium text-primary hover:underline">
          Volver a mi perfil
        </Link>
      </div>

      {docsQuery.error && <ErrorBanner message={docsQuery.error.message} />}
      {downloadError && <ErrorBanner message={downloadError} onDismiss={() => setDownloadError(null)} />}

      {docsQuery.loading ? (
        <div className="flex items-center gap-2 py-8">
          <Spinner />
          <span className="text-sm text-muted">{MESSAGES.common.loading}</span>
        </div>
      ) : docsQuery.data && docsQuery.data.length === 0 ? (
        <p className="rounded-lg border border-border p-6 text-center text-sm text-muted">{MESSAGES.documents.empty}</p>
      ) : docsQuery.data ? (
        <div className="w-full overflow-x-auto rounded-lg border border-border">
          <table className="min-w-full divide-y divide-border text-left text-sm">
            <thead className="bg-active">
              <tr>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.titleLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.typeLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.issuedAtLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">{MESSAGES.documents.expiresAtLabel}</th>
                <th className="px-4 py-3 font-semibold text-heading">Estado</th>
                <th className="px-4 py-3 font-semibold text-heading">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-page">
              {docsQuery.data.map((doc) => (
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
                    <Button variant="secondary" onClick={() => void handleDownload(doc)}>
                      {MESSAGES.documents.downloadButton}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
