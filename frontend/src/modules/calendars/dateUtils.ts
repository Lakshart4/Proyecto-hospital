import { TIME_ZONE } from '../../shared/lib/formatters';
import type { CalendarViewMode } from './types';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const pad = (value: number) => String(value).padStart(2, '0');

function partsInTimeZone(value: Date): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const result: Record<string, number> = {};
  for (const part of parts) {
    if (part.type !== 'literal') result[part.type] = Number(part.value);
  }
  return result;
}

export function parseNaturalDate(value: string): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new RangeError('Fecha inválida.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError('Fecha inválida.');
  }
  return { year, month, day };
}

export function naturalDateOf(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return '';
  const parts = partsInTimeZone(date);
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function todayNaturalDate(): string {
  return naturalDateOf(new Date());
}

export function addDays(value: string, amount: number): string {
  const { year, month, day } = parseNaturalDate(value);
  const result = new Date(Date.UTC(year, month - 1, day + amount));
  return `${String(result.getUTCFullYear()).padStart(4, '0')}-${pad(result.getUTCMonth() + 1)}-${pad(result.getUTCDate())}`;
}

export function dayOfWeek(value: string): number {
  const { year, month, day } = parseNaturalDate(value);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getCalendarDays(anchor: string, view: CalendarViewMode): string[] {
  parseNaturalDate(anchor);
  if (view === 'week') {
    const mondayOffset = (dayOfWeek(anchor) + 6) % 7;
    const monday = addDays(anchor, -mondayOffset);
    return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
  }

  const { year, month } = parseNaturalDate(anchor);
  const first = `${String(year).padStart(4, '0')}-${pad(month)}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const last = `${String(year).padStart(4, '0')}-${pad(month)}-${pad(lastDay)}`;
  const start = addDays(first, -((dayOfWeek(first) + 6) % 7));
  const end = addDays(last, 6 - ((dayOfWeek(last) + 6) % 7));
  const length = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
  return Array.from({ length }, (_, index) => addDays(start, index));
}

export function moveAnchor(anchor: string, view: CalendarViewMode, direction: -1 | 1): string {
  if (view === 'week') return addDays(anchor, direction * 7);
  const { year, month, day } = parseNaturalDate(anchor);
  const moved = new Date(Date.UTC(year, month - 1 + direction, 1));
  const lastDay = new Date(Date.UTC(moved.getUTCFullYear(), moved.getUTCMonth() + 1, 0)).getUTCDate();
  return `${String(moved.getUTCFullYear()).padStart(4, '0')}-${pad(moved.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

export function yearsInDays(days: readonly string[]): number[] {
  const years = new Set<number>();
  for (const day of days) years.add(Number(day.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

export function toDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = partsInTimeZone(date);
  return `${String(parts.year).padStart(4, '0')}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function timeZoneOffsetMs(instant: Date): number {
  const parts = partsInTimeZone(instant);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Convierte la hora de un input datetime-local interpretada en la zona institucional a un instante ISO. */
export function hospitalDateTimeToIso(value: string): string {
  const match = DATE_TIME_PATTERN.exec(value);
  if (!match) throw new RangeError('Fecha y hora inválidas.');
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  parseNaturalDate(`${yearText}-${monthText}-${dayText}`);
  if (hour > 23 || minute > 59) throw new RangeError('Fecha y hora inválidas.');
  const wallClock = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wallClock - timeZoneOffsetMs(new Date(wallClock));
  const corrected = wallClock - timeZoneOffsetMs(new Date(guess));
  if (corrected !== guess) guess = corrected;
  return new Date(guess).toISOString();
}

export function naturalDateToIso(value: string): string {
  parseNaturalDate(value);
  return `${value}T00:00:00.000Z`;
}

export function calendarTitle(anchor: string, view: CalendarViewMode): string {
  if (view === 'month') {
    const date = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
    const label = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(date);
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  const days = getCalendarDays(anchor, view);
  const first = new Date(`${days[0]}T00:00:00Z`);
  const last = new Date(`${days[6]}T00:00:00Z`);
  const from = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(first);
  const to = new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(last);
  return `${from} – ${to}`;
}

export function shortNaturalDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' }).format(date);
}
