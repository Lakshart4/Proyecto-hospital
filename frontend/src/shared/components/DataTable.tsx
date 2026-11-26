import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { useCallback, useEffect, type ReactNode } from 'react';
import { usePagination, DEFAULT_PAGE_SIZE } from '../hooks/usePagination';
import { useSort } from '../hooks/useSort';
import { MESSAGES } from '../lib/messages';
import type { SortValue } from '../lib/sortRows';
import { Button } from './Button';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  /** Contenido de la celda; por defecto, el valor de orden como texto. */
  render?: (row: T) => ReactNode;
  /** Valor para ordenar; si no se indica, la columna no se puede ordenar. */
  sortValue?: (row: T) => SortValue;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
  caption: string;
  pageSize?: number;
  emptyMessage?: string;
}

/** Tabla con orden ascendente/descendente por columna y paginación (Req. 15.5, 15.10). */
export function DataTable<T>({ columns, rows, rowKey, caption, pageSize = DEFAULT_PAGE_SIZE, emptyMessage = MESSAGES.common.noResults }: DataTableProps<T>) {
  const getValue = useCallback((row: T, key: string) => columns.find((c) => c.key === key)?.sortValue?.(row), [columns]);
  const { sorted, sort, toggle } = useSort<T, string>(rows, getValue);
  const pagination = usePagination(sorted.length, pageSize);
  const visible = pagination.slice(sorted);
  const { setPage } = pagination;

  // Al cambiar el orden se vuelve a la primera página.
  useEffect(() => setPage(1), [sort, setPage]);

  return (
    <div className="flex flex-col gap-3">
      <div className="w-full overflow-x-auto rounded-xl border border-border bg-page shadow-sm">
        <table className="min-w-full divide-y divide-border text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-slate-50">
            <tr>
              {columns.map((column) => {
                const direction = sort?.key === column.key ? sort.direction : undefined;
                const ariaSort = direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : column.sortValue ? 'none' : undefined;
                const Icon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
                return (
                  <th key={column.key} scope="col" aria-sort={ariaSort} className="whitespace-nowrap px-4 py-3.5 text-xs font-semibold uppercase tracking-wide text-muted">
                    {column.sortValue ? (
                      <button type="button" onClick={() => toggle(column.key)} aria-label={MESSAGES.table.sortBy(column.header)} className="inline-flex items-center gap-1 hover:underline">
                        {column.header}
                        <Icon aria-hidden="true" className="h-4 w-4" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border bg-page">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={rowKey(row)} className="transition-colors hover:bg-active/70">
                  {columns.map((column) => (
                    <td key={column.key} className="whitespace-nowrap px-4 py-3.5 text-ink">
                      {column.render ? column.render(row) : String(column.sortValue?.(row) ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {pagination.pageCount > 1 && (
        <nav aria-label={caption} className="flex items-center justify-end gap-3 text-sm text-ink">
          <Button variant="secondary" onClick={pagination.previous} disabled={!pagination.hasPrevious}>
            {MESSAGES.table.previous}
          </Button>
          <span>{MESSAGES.table.page(pagination.page, pagination.pageCount)}</span>
          <Button variant="secondary" onClick={pagination.next} disabled={!pagination.hasNext}>
            {MESSAGES.table.next}
          </Button>
        </nav>
      )}
    </div>
  );
}
