import { Spinner } from '../../../shared/components/Spinner';

export function LoadingState({ message = 'Cargando…' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-page px-4 py-10 text-sm text-muted">
      <Spinner label={message} />
      <span>{message}</span>
    </div>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-page px-4 py-10 text-center">
      <p className="font-medium text-heading">{title}</p>
      <p className="mt-1 text-sm text-muted">{message}</p>
    </div>
  );
}

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  disabled = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav aria-label="Paginación" className="flex flex-col gap-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
      <span>Mostrando {first}–{last} de {total}</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-border bg-page px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange(page - 1)}
          disabled={disabled || page <= 1}
        >
          Anterior
        </button>
        <span aria-current="page">Página {page} de {pageCount}</span>
        <button
          type="button"
          className="rounded-md border border-border bg-page px-3 py-2 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onPageChange(page + 1)}
          disabled={disabled || page >= pageCount}
        >
          Siguiente
        </button>
      </div>
    </nav>
  );
}
