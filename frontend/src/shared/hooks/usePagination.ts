// Estado de paginación de una tabla (Req. 15.5). La página siempre queda entre 1 y el número de páginas
// (al menos 1, también con una lista vacía), aunque el total cambie o se pida una página fuera de rango.

import { useCallback, useMemo, useState } from 'react';

export const DEFAULT_PAGE_SIZE = 10;

export function pageCountOf(total: number, pageSize: number): number {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('El tamaño de página debe ser un entero mayor o igual a 1.');
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), pageCount);
}

export function usePagination(total: number, pageSize: number = DEFAULT_PAGE_SIZE) {
  const pageCount = pageCountOf(total, pageSize);
  const [requested, setRequested] = useState(1);
  const page = clampPage(requested, pageCount);

  const setPage = useCallback((next: number) => setRequested(clampPage(next, pageCount)), [pageCount]);
  const next = useCallback(() => setRequested(clampPage(page + 1, pageCount)), [page, pageCount]);
  const previous = useCallback(() => setRequested(clampPage(page - 1, pageCount)), [page, pageCount]);

  const range = useMemo(() => ({ start: (page - 1) * pageSize, end: Math.min(page * pageSize, Math.max(0, total)) }), [page, pageSize, total]);
  const slice = useCallback(<T,>(rows: readonly T[]): T[] => rows.slice(range.start, range.end), [range]);

  return { page, pageCount, pageSize, setPage, next, previous, hasPrevious: page > 1, hasNext: page < pageCount, range, slice };
}
