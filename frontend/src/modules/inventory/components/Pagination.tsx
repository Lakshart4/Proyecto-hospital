import { Button } from '../../../shared/components/Button';
import { INPUT_CLASSES } from '../../../shared/components/FormField';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
  label?: string;
}

/** Controles para la paginación real de la API, no una división local de los resultados. */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, disabled = false, label = 'Paginación' }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink">
      <span className="text-muted" aria-live="polite">
        {total === 0 ? 'Sin resultados' : `Mostrando ${first}–${last} de ${total}`}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="text-muted">Filas</span>
          <select
            aria-label="Elementos por página"
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className={`${INPUT_CLASSES} w-auto py-1.5`}
          >
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
        <Button variant="secondary" disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
        <span>Página {page} de {pageCount}</span>
        <Button variant="secondary" disabled={disabled || page >= pageCount} onClick={() => onPageChange(page + 1)}>Siguiente</Button>
      </div>
    </nav>
  );
}
