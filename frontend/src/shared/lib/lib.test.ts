// Pruebas de la paleta, los textos, el contraste y el ordenamiento (tareas 5.1 y 5.4).

import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config';
import {
  BASE_COLORS,
  EVENT_COLORS,
  EVENT_COLOR_CLASSES,
  EVENT_TYPES,
  STATUS_TONES,
  STATUS_TONE_CLASSES,
  TEXT_COLOR_PAIRS,
  statusTone,
  tailwindThemeColors,
} from './colors';
import { MIN_TEXT_CONTRAST, contrastRatio, parseHexColor, relativeLuminance } from './contrast';
import { MESSAGES } from './messages';
import { compareSortValues, sortRows } from './sortRows';

describe('paleta', () => {
  it('usa los colores del diseño: fondo blanco, botones blue-700, encabezados blue-800, activo blue-50 y texto slate-900', () => {
    expect(BASE_COLORS).toMatchObject({ page: '#ffffff', primary: '#1d4ed8', heading: '#1e40af', active: '#eff6ff', ink: '#0f172a' });
  });

  it('todos los pares texto/fondo declarados tienen contraste ≥ 4.5:1', () => {
    expect(TEXT_COLOR_PAIRS.length).toBeGreaterThanOrEqual(15);
    for (const pair of TEXT_COLOR_PAIRS) expect(contrastRatio(pair.fg, pair.bg), pair.name).toBeGreaterThanOrEqual(MIN_TEXT_CONTRAST);
  });

  it('los siete Tipos_de_Evento tienen colores distintos, visibles sobre blanco (≥ 3:1) y una clase propia', () => {
    expect(EVENT_TYPES).toHaveLength(7);
    expect(new Set(Object.values(EVENT_COLORS)).size).toBe(7);
    expect(new Set(Object.values(EVENT_COLOR_CLASSES)).size).toBe(7);
    for (const type of EVENT_TYPES) expect(contrastRatio(EVENT_COLORS[type], BASE_COLORS.page)).toBeGreaterThanOrEqual(3);
  });

  it('asigna el tono de cada estado según el diseño y neutral a los desconocidos', () => {
    const expected: Record<string, string> = {
      activo: 'success', disponible: 'success', recibida: 'success', realizado: 'success',
      'dado de alta': 'info', programado: 'info', programada: 'info',
      fallecido: 'danger', 'fuera de servicio': 'danger', agotado: 'danger', 'Stock bajo': 'danger', cancelado: 'danger', cancelada: 'danger',
      'en mantenimiento': 'warning', 'en uso': 'warning', ocupada: 'orange', Controlado: 'purple', 'otro valor': 'neutral',
    };
    for (const [value, tone] of Object.entries(expected)) expect(statusTone(value), value).toBe(tone);
    expect(Object.keys(STATUS_TONE_CLASSES).sort()).toEqual(Object.keys(STATUS_TONES).sort());
  });

  it('tailwind.config.ts toma los colores de la misma definición', () => {
    expect(config.theme?.extend?.colors).toEqual(tailwindThemeColors());
    const colors = tailwindThemeColors() as Record<string, unknown>;
    expect(colors.primary).toBe(BASE_COLORS.primary);
    expect((colors.status as Record<string, { fg: string }>).success.fg).toBe(STATUS_TONES.success.fg);
  });
});

describe('textos', () => {
  const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'function') return [String((value as (...args: number[]) => string)(1, 2))];
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
  };

  it('todos los textos están en español y no hay palabras comunes en inglés', () => {
    const all = strings(MESSAGES);
    expect(all.length).toBeGreaterThan(10);
    for (const text of all) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/\b(the|and|loading|cancel|confirm|search|next|previous|page|close|error|sort|results|dismiss)\b/i);
    }
  });

  it('las funciones de texto componen frases en español', () => {
    expect(MESSAGES.table.page(2, 5)).toBe('Página 2 de 5');
    expect(MESSAGES.progress.percent(67)).toBe('67 %');
  });
});

describe('contrastRatio', () => {
  it('blanco y negro dan 21; un color consigo mismo da 1; el orden no importa', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 10);
    expect(contrastRatio('#ffffff', '#000')).toBeCloseTo(21, 10);
    expect(contrastRatio('#1d4ed8', '#1d4ed8')).toBe(1);
    expect(contrastRatio('#1d4ed8', '#ffffff')).toBe(contrastRatio('#ffffff', '#1d4ed8'));
  });

  it('coincide con valores de referencia de WCAG', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(relativeLuminance('#ffffff')).toBe(1);
    expect(relativeLuminance('#000000')).toBe(0);
  });

  it('acepta #rgb y #rrggbb y rechaza otros formatos', () => {
    expect(parseHexColor('#abc')).toEqual([0xaa, 0xbb, 0xcc]);
    expect(parseHexColor('#1D4ED8')).toEqual([29, 78, 216]);
    for (const bad of ['', 'abc', '#12', '#12345g', 'rgb(0,0,0)']) expect(() => parseHexColor(bad)).toThrow(RangeError);
  });
});

describe('sortRows', () => {
  const rows = [
    { id: 1, name: 'Óscar', age: 30, date: new Date('2026-01-02'), active: true },
    { id: 2, name: 'ana', age: 9, date: new Date('2025-12-31'), active: false },
    { id: 3, name: 'Beto', age: 10, date: null, active: true },
    { id: 4, name: 'Ana', age: 30, date: new Date('2026-01-02'), active: false },
  ];
  const ids = (list: typeof rows) => list.map((r) => r.id);

  it('ordena números por valor (9 antes que 10) y alterna la dirección', () => {
    expect(ids(sortRows(rows, (r) => r.age, 'asc'))).toEqual([2, 3, 1, 4]);
    expect(ids(sortRows(rows, (r) => r.age, 'desc'))).toEqual([1, 4, 3, 2]);
  });

  it('ordena textos en español sin distinguir mayúsculas ni acentos; los empates conservan el orden', () => {
    expect(ids(sortRows(rows, (r) => r.name, 'asc'))).toEqual([2, 4, 3, 1]);
    expect(ids(sortRows(rows, (r) => r.name, 'desc'))).toEqual([1, 3, 2, 4]);
    expect(compareSortValues('item 2', 'item 10')).toBeLessThan(0);
  });

  it('ordena fechas por valor y deja los vacíos como menores', () => {
    expect(ids(sortRows(rows, (r) => r.date, 'asc'))).toEqual([3, 2, 1, 4]);
    expect(ids(sortRows(rows, (r) => r.date, 'desc'))).toEqual([1, 4, 2, 3]);
    expect(compareSortValues(new Date('x'), null)).toBe(0);
  });

  it('ordena booleanos con falso antes que verdadero', () => {
    expect(ids(sortRows(rows, (r) => r.active, 'asc'))).toEqual([2, 4, 1, 3]);
  });

  it('no modifica la lista recibida y devuelve una lista nueva; una lista vacía da vacía', () => {
    const copy = [...rows];
    const sorted = sortRows(rows, (r) => r.age, 'asc');
    expect(rows).toEqual(copy);
    expect(sorted).not.toBe(rows);
    expect(sortRows([], () => 1, 'desc')).toEqual([]);
  });
});
