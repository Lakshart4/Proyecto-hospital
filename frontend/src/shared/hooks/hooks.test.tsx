// Pruebas de useSort y usePagination (tarea 5.4).

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clampPage, pageCountOf, usePagination } from './usePagination';
import { useSort } from './useSort';

type Row = { id: number; name: string };
const rows: Row[] = [
  { id: 1, name: 'Carla' },
  { id: 2, name: 'ana' },
  { id: 3, name: 'Beto' },
];
const getValue = (row: Row, key: 'name' | 'id') => row[key];

describe('useSort', () => {
  it('sin orden conserva la lista; la misma columna alterna la dirección y otra columna empieza en ascendente', () => {
    const { result } = renderHook(() => useSort(rows, getValue));
    expect(result.current.sorted.map((r) => r.id)).toEqual([1, 2, 3]);
    act(() => result.current.toggle('name'));
    expect(result.current.sort).toEqual({ key: 'name', direction: 'asc' });
    expect(result.current.sorted.map((r) => r.id)).toEqual([2, 3, 1]);
    act(() => result.current.toggle('name'));
    expect(result.current.sort).toEqual({ key: 'name', direction: 'desc' });
    expect(result.current.sorted.map((r) => r.id)).toEqual([1, 3, 2]);
    act(() => result.current.toggle('id'));
    expect(result.current.sort).toEqual({ key: 'id', direction: 'asc' });
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
  });
});

describe('usePagination', () => {
  it('calcula páginas con al menos una y limita la página al rango', () => {
    expect(pageCountOf(0, 10)).toBe(1);
    expect(pageCountOf(10, 10)).toBe(1);
    expect(pageCountOf(11, 10)).toBe(2);
    expect(() => pageCountOf(5, 0)).toThrow(RangeError);
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(Number.NaN, 3)).toBe(1);
    expect(clampPage(2.7, 3)).toBe(2);
  });

  it('avanza, retrocede y corta la página actual sin salir del rango', () => {
    const list = Array.from({ length: 23 }, (_, i) => i);
    const { result } = renderHook(() => usePagination(list.length, 10));
    expect(result.current.slice(list)).toEqual(list.slice(0, 10));
    expect(result.current.hasPrevious).toBe(false);
    act(() => result.current.next());
    act(() => result.current.next());
    expect(result.current.page).toBe(3);
    expect(result.current.slice(list)).toEqual([20, 21, 22]);
    act(() => result.current.next());
    expect(result.current.page).toBe(3);
    expect(result.current.hasNext).toBe(false);
    act(() => result.current.setPage(-4));
    expect(result.current.page).toBe(1);
    act(() => result.current.previous());
    expect(result.current.page).toBe(1);
  });

  it('si el total se reduce, la página se ajusta a la última disponible; una lista vacía tiene una página vacía', () => {
    const { result, rerender } = renderHook(({ total }) => usePagination(total, 5), { initialProps: { total: 20 } });
    act(() => result.current.setPage(4));
    rerender({ total: 7 });
    expect(result.current.page).toBe(2);
    rerender({ total: 0 });
    expect(result.current.page).toBe(1);
    expect(result.current.pageCount).toBe(1);
    expect(result.current.slice([])).toEqual([]);
  });
});
