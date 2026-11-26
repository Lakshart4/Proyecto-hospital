// Reglas puras del Horario_de_Trabajo de un día (Req. 5.15, 5.16).
//
// `validateDaySchedule` devuelve la lista de errores por campo (vacía si el día es válido):
// - todas las horas con formato HH:mm (00:00 a 23:59);
// - salida posterior a la entrada;
// - comida opcional: si se indica, con inicio y fin, inicio anterior al fin y dentro de [entrada, salida];
// - como máximo 3 Descansos, cada uno con inicio anterior al fin y dentro de [entrada, salida];
// - ningún Descanso se solapa con otro ni con la comida. Los intervalos que solo se tocan en un
//   extremo (uno termina a la hora en que empieza el otro) no se consideran solapados.
// Si una hora tiene formato inválido, se informa en su campo y se omiten las comparaciones que la usan.

import type { FieldError } from '../lib/errors';

export const MAX_BREAKS_PER_DAY = 3;

export interface TimeRange {
  startTime: string;
  endTime: string;
}

export interface DaySchedule extends TimeRange {
  mealStart?: string | null;
  mealEnd?: string | null;
  breaks: readonly TimeRange[];
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Minutos desde las 00:00, o null si el texto no tiene formato HH:mm. */
export function parseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !HH_MM.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number) as [number, number];
  return hours * 60 + minutes;
}

const MESSAGES = {
  format: 'La hora debe tener el formato HH:mm.',
  endAfterStart: 'La hora de salida debe ser posterior a la de entrada.',
  mealIncomplete: 'El periodo de comida necesita hora de inicio y de fin.',
  mealOrder: 'El fin de la comida debe ser posterior a su inicio.',
  mealOutside: 'La comida debe estar dentro del horario de entrada a salida.',
  tooManyBreaks: `Se permiten como máximo ${MAX_BREAKS_PER_DAY} descansos por día.`,
  breakOrder: 'El fin del descanso debe ser posterior a su inicio.',
  breakOutside: 'El descanso debe estar dentro del horario de entrada a salida.',
  breakOverlapsBreak: 'El descanso se solapa con otro descanso.',
  breakOverlapsMeal: 'El descanso se solapa con el periodo de comida.',
} as const;

interface Interval {
  start: number;
  end: number;
}

/** Dos intervalos [a, b) y [c, d) se solapan si comparten algún minuto. */
const overlaps = (a: Interval, b: Interval) => a.start < b.end && b.start < a.end;
const isBlank = (value: string | null | undefined) => value === undefined || value === null || value === '';

export function validateDaySchedule(day: DaySchedule): FieldError[] {
  const errors: FieldError[] = [];
  const add = (field: string, message: string) => {
    if (!errors.some((e) => e.field === field)) errors.push({ field, message });
  };
  const time = (field: string, value: unknown) => {
    const minutes = parseTime(value);
    if (minutes === null) add(field, MESSAGES.format);
    return minutes;
  };

  // Entrada y salida.
  const start = time('startTime', day.startTime);
  const end = time('endTime', day.endTime);
  const workday = start !== null && end !== null ? { start, end } : null;
  if (workday && workday.end <= workday.start) add('endTime', MESSAGES.endAfterStart);
  const within = (i: Interval) => workday !== null && workday.end > workday.start && i.start >= workday.start && i.end <= workday.end;
  const canCheckWithin = workday !== null && workday.end > workday.start;

  // Comida (opcional).
  let meal: Interval | null = null;
  const mealStartBlank = isBlank(day.mealStart);
  const mealEndBlank = isBlank(day.mealEnd);
  if (mealStartBlank !== mealEndBlank) {
    add(mealStartBlank ? 'mealStart' : 'mealEnd', MESSAGES.mealIncomplete);
  } else if (!mealStartBlank) {
    const mealStart = time('mealStart', day.mealStart);
    const mealEnd = time('mealEnd', day.mealEnd);
    if (mealStart !== null && mealEnd !== null) {
      if (mealEnd <= mealStart) add('mealEnd', MESSAGES.mealOrder);
      else {
        meal = { start: mealStart, end: mealEnd };
        if (canCheckWithin && !within(meal)) add('mealStart', MESSAGES.mealOutside);
      }
    }
  }

  // Descansos.
  if (day.breaks.length > MAX_BREAKS_PER_DAY) add('breaks', MESSAGES.tooManyBreaks);
  const valid: { index: number; interval: Interval }[] = [];
  day.breaks.forEach((b, index) => {
    const field = `breaks.${index}`;
    const bStart = time(`${field}.startTime`, b.startTime);
    const bEnd = time(`${field}.endTime`, b.endTime);
    if (bStart === null || bEnd === null) return;
    if (bEnd <= bStart) {
      add(`${field}.endTime`, MESSAGES.breakOrder);
      return;
    }
    const interval = { start: bStart, end: bEnd };
    if (canCheckWithin && !within(interval)) add(field, MESSAGES.breakOutside);
    if (meal && overlaps(interval, meal)) add(field, MESSAGES.breakOverlapsMeal);
    if (valid.some((other) => overlaps(interval, other.interval))) add(field, MESSAGES.breakOverlapsBreak);
    valid.push({ index, interval });
  });

  return errors;
}
