import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { Spinner } from '../../../shared/components/Spinner';
import { formatDate } from '../../../shared/lib/formatters';
import type { ApiError } from '../../../shared/lib/apiClient';
import type { NonWorkingDay } from '../types';

export interface NonWorkingDaysPanelProps {
  days: readonly NonWorkingDay[];
  loading: boolean;
  error: ApiError | null;
  isAdmin: boolean;
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (day: NonWorkingDay) => void;
  onDelete: (day: NonWorkingDay) => void;
}

export function NonWorkingDaysPanel({ days, loading, error, isAdmin, onRetry, onCreate, onEdit, onDelete }: NonWorkingDaysPanelProps) {
  return (
    <section className="rounded-lg border border-border bg-page" aria-labelledby="non-working-days-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 id="non-working-days-title" className="font-semibold text-heading">Días inhábiles registrados</h2>
          <p className="text-xs text-muted">Fechas institucionales sin actividades ordinarias.</p>
        </div>
        {isAdmin && (
          <Button variant="secondary" onClick={onCreate}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Nuevo día inhábil
          </Button>
        )}
      </div>
      <div className="p-4">
        {error && <ErrorBanner message={error.message} />}
        {error && <Button variant="secondary" className="mt-3" onClick={onRetry}>Reintentar</Button>}
        {loading ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted"><Spinner /><span>Cargando días inhábiles…</span></div>
        ) : !error && days.length === 0 ? (
          <p className="py-4 text-sm text-muted">No hay días inhábiles registrados.</p>
        ) : !error && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <caption className="sr-only">Listado de días inhábiles</caption>
              <thead>
                <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="py-2 pr-4 font-semibold">Fecha</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Título</th>
                  <th scope="col" className="py-2 pr-4 font-semibold">Descripción</th>
                  {isAdmin && <th scope="col" className="py-2 font-semibold">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {days.map((day) => (
                  <tr key={day.id} className="border-b border-border last:border-b-0">
                    <td className="whitespace-nowrap py-3 pr-4">{formatDate(day.date.slice(0, 10))}</td>
                    <th scope="row" className="py-3 pr-4 font-medium text-heading">{day.title}</th>
                    <td className="max-w-md py-3 pr-4 text-muted">{day.description || '—'}</td>
                    {isAdmin && (
                      <td className="py-3">
                        <div className="flex gap-2">
                          <button type="button" onClick={() => onEdit(day)} aria-label={`Editar ${day.title}`} className="rounded p-2 text-primary hover:bg-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            <Pencil aria-hidden="true" className="h-4 w-4" />
                          </button>
                          <button type="button" onClick={() => onDelete(day)} aria-label={`Eliminar ${day.title}`} className="rounded p-2 text-status-danger-fg hover:bg-status-danger-bg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                            <Trash2 aria-hidden="true" className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
