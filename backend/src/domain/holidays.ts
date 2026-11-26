// Reglas puras de feriados (Req. 11.1, 11.6).
//
// `parseYear` valida el año solicitado (entero de 1900 a 2100) antes de cualquier consulta externa.
// `parseNagerHolidays` convierte la respuesta de Nager.Date (`GET /api/v3/PublicHolidays/{año}/{país}`)
// en la forma que usan los calendarios (`HolidayLike`: fecha natural y nombre).

import { ValidationError } from '../lib/errors';
import type { HolidayLike } from './events';
import { parseIntegerString } from './others';
import { isNaturalDate } from './time';

export const MIN_HOLIDAY_YEAR = 1900;
export const MAX_HOLIDAY_YEAR = 2100;
export const INVALID_YEAR_MESSAGE = `El año no es válido: debe ser un número entero entre ${MIN_HOLIDAY_YEAR} y ${MAX_HOLIDAY_YEAR}.`;

/**
 * Año de feriados: entero de 1900 a 2100, escrito solo con dígitos (misma interpretación estricta que la
 * paginación). @throws ValidationError (400) en el campo `year` en cualquier otro caso.
 */
export function parseYear(value: unknown): number {
  const year = parseIntegerString(value);
  if (year === null || year < MIN_HOLIDAY_YEAR || year > MAX_HOLIDAY_YEAR) {
    throw new ValidationError(INVALID_YEAR_MESSAGE, [{ field: 'year', message: INVALID_YEAR_MESSAGE }]);
  }
  return year;
}

/**
 * Convierte el cuerpo JSON de Nager.Date en feriados. Cada elemento debe tener `date` (AAAA-MM-DD) del año
 * pedido y un nombre (`localName`, en el idioma del país, o `name`). Devuelve null si el cuerpo no tiene
 * esa forma; el servicio lo trata como una respuesta con error.
 */
export function parseNagerHolidays(body: unknown, year: number): HolidayLike[] | null {
  if (!Array.isArray(body)) return null;
  const holidays: HolidayLike[] = [];
  for (const item of body) {
    if (typeof item !== 'object' || item === null) return null;
    const { date, localName, name } = item as Record<string, unknown>;
    const label = typeof localName === 'string' && localName.trim() !== '' ? localName : name;
    if (!isNaturalDate(date) || !date.startsWith(`${year}-`) || typeof label !== 'string' || label.trim() === '') return null;
    holidays.push({ date, name: label.trim() });
  }
  return holidays;
}
