// Estado de ordenamiento de una tabla (Req. 15.5). Elegir la misma columna alterna la dirección; elegir
// otra columna empieza en ascendente.

import { useCallback, useMemo, useState } from 'react';
import { sortRows, type SortDirection, type SortValue } from '../lib/sortRows';

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export function useSort<T, K extends string>(
  rows: readonly T[],
  getValue: (row: T, key: K) => SortValue,
  initial: SortState<K> | null = null,
) {
  const [sort, setSort] = useState<SortState<K> | null>(initial);

  const toggle = useCallback((key: K) => {
    setSort((current) => (current?.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' }));
  }, []);

  const sorted = useMemo(
    () => (sort === null ? [...rows] : sortRows(rows, (row) => getValue(row, sort.key), sort.direction)),
    [rows, getValue, sort],
  );

  return { sorted, sort, toggle, setSort };
}
