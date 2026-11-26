// Ordenamiento de tablas (Req. 15.5, Property 43).
//
// - Devuelve una copia ordenada; la lista recibida no cambia.
// - Orden estable: los empates conservan el orden de entrada en ambas direcciones.
// - Descendente invierte la comparación, así que es el reverso del ascendente salvo empates.
// - Números y fechas por valor; textos con orden alfabético en español, sin distinguir mayúsculas ni
//   acentos y con los números del texto en orden numérico; booleanos falso antes que verdadero.
// - Los valores vacíos (null, undefined o fechas inválidas) se consideran los menores: van primero en
//   ascendente y al final en descendente.

export type SortValue = string | number | boolean | Date | null | undefined;
export type SortDirection = 'asc' | 'desc';

const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

function rank(value: SortValue): number {
  if (value === null || value === undefined) return 0;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 0 : 2;
  if (typeof value === 'number') return Number.isNaN(value) ? 0 : 1;
  if (typeof value === 'boolean') return 3;
  return 4;
}

/** Compara dos valores de una columna: negativo, cero o positivo. */
export function compareSortValues(a: SortValue, b: SortValue): number {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  if (ra === 0) return 0;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

export function sortRows<T>(rows: readonly T[], getValue: (row: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: getValue(row) }))
    .sort((x, y) => sign * compareSortValues(x.value, y.value) || x.index - y.index)
    .map((entry) => entry.row);
}
