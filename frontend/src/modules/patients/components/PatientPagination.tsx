import { Button } from '../../../shared/components/Button';
import { INPUT_CLASSES } from '../../../shared/components/FormField';

export interface PatientPaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export function PatientPagination({ page, pageSize, total, onPageChange, onPageSizeChange }: PatientPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginación de pacientes" className="flex flex-col gap-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">Mostrando {first}–{last} de {total} pacientes</p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2">
            <span>Por página</span>
            <select aria-label="Pacientes por página" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className={`${INPUT_CLASSES} w-auto`}>
              {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
        )}
        <Button variant="secondary" onClick={() => onPageChange(page - 1)} disabled={page <= 1}>Anterior</Button>
        <span className="px-1">Página {page} de {pageCount}</span>
        <Button variant="secondary" onClick={() => onPageChange(page + 1)} disabled={page >= pageCount}>Siguiente</Button>
      </div>
    </nav>
  );
}
