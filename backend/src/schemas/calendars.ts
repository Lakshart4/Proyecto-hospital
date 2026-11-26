// Esquemas zod de Calendarios, Eventos, Días_Inhábiles y Feriados (Req. 10, 11, 28).

import { z } from 'zod';
import { STORED_EVENT_TYPES } from '../domain/constants';
import { dayRange, isNaturalDate, naturalDateOf, naturalDateToStored } from '../domain/time';
import {
  optionalQueryIntInRange,
  QUERY_DATE_MESSAGE,
  queryIntInRange,
  REQUIRED_MESSAGE,
  requiredText,
  TEXT_TYPE_MESSAGE,
} from './common';

const MAX_ID = 2_147_483_647;

export const CALENDAR_EVENT_TYPES = ['general', 'actividad', 'entrega'] as const;
export const EVENT_TYPE_MESSAGE = 'El tipo debe ser general, actividad o entrega.';
export const EVENT_DATE_MESSAGE = 'La fecha es obligatoria y debe ser una fecha válida.';
export const CALENDAR_RANGE_MESSAGE = 'La fecha final no puede ser anterior a la fecha inicial.';

const validateRange = (value: { from: Date; to: Date }, ctx: z.RefinementCtx) => {
  if (value.from.getTime() > value.to.getTime()) {
    ctx.addIssue({ code: 'custom', path: ['to'], message: CALENDAR_RANGE_MESSAGE });
  }
};

const dateInput = (message: string) =>
  z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? message : message) })
    .trim()
    .min(1, message)
    .transform((text, ctx) => {
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: 'custom', message });
        return z.NEVER;
      }
      return parsed;
    });

// Una query AAAA-MM-DD es una fecha natural institucional, no la medianoche UTC (que en México sería
// el día anterior). Los demás valores ISO se conservan como instantes.
const calendarDateField = () =>
  z
    .string({ error: (issue) => (issue.input === undefined || issue.input === null ? REQUIRED_MESSAGE : QUERY_DATE_MESSAGE) })
    .trim()
    .min(1, REQUIRED_MESSAGE)
    .transform((text, ctx) => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        if (!isNaturalDate(text)) {
          ctx.addIssue({ code: 'custom', message: QUERY_DATE_MESSAGE });
          return z.NEVER;
        }
        return dayRange(text).start;
      }
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({ code: 'custom', message: QUERY_DATE_MESSAGE });
        return z.NEVER;
      }
      return parsed;
    });

const optionalDescription = z.preprocess(
  (value) => (value === '' || value === undefined || value === null ? undefined : value),
  z.string({ error: TEXT_TYPE_MESSAGE }).max(500, 'Debe tener como máximo 500 caracteres.').optional(),
);

export const eventIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });
export const nonWorkingDayIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });

export const calendarRangeQuerySchema = z
  .object({
    from: calendarDateField(),
    to: calendarDateField(),
  })
  .passthrough()
  .superRefine(validateRange);

export type CalendarRangeQuery = z.infer<typeof calendarRangeQuerySchema>;

export const birthdaysQuerySchema = z
  .object({ year: queryIntInRange(1, 9999) })
  .passthrough();

export type BirthdaysQuery = z.infer<typeof birthdaysQuerySchema>;

export const agendaQuerySchema = z
  .object({
    userId: optionalQueryIntInRange(1, MAX_ID),
    from: calendarDateField(),
    to: calendarDateField(),
  })
  .passthrough()
  .superRefine(validateRange);

export type AgendaQuery = z.infer<typeof agendaQuerySchema>;

export const holidaysQuerySchema = z
  .object({ year: queryIntInRange(1900, 2100) })
  .passthrough();

export type HolidaysQuery = z.infer<typeof holidaysQuerySchema>;

export const eventBodySchema = z.object({
  title: requiredText({ max: 150 }),
  description: optionalDescription,
  type: z.enum(CALENDAR_EVENT_TYPES, { error: EVENT_TYPE_MESSAGE }),
  startAt: dateInput(EVENT_DATE_MESSAGE),
  endAt: dateInput(EVENT_DATE_MESSAGE),
});

export type EventBody = z.infer<typeof eventBodySchema>;

export const personalEventBodySchema = z.object({
  title: requiredText({ max: 150 }),
  description: optionalDescription,
  startAt: dateInput(EVENT_DATE_MESSAGE),
  endAt: dateInput(EVENT_DATE_MESSAGE),
});

export type PersonalEventBody = z.infer<typeof personalEventBodySchema>;

export const nonWorkingDayBodySchema = z.object({
  title: requiredText({ max: 150 }),
  description: z.preprocess(
    (value) => (value === undefined || value === null ? '' : value),
    z.string({ error: TEXT_TYPE_MESSAGE }).trim().max(500, 'Debe tener como máximo 500 caracteres.'),
  ),
  // La fecha natural se guarda siempre a las 00:00 UTC, como exige el modelo.
  date: dateInput(EVENT_DATE_MESSAGE).transform((date) => naturalDateToStored(naturalDateOf(date))),
});

export type NonWorkingDayBody = z.infer<typeof nonWorkingDayBodySchema>;

/** Tipos que se pueden guardar con `POST /events` (la agenda individual tiene su propio recurso). */
export const STORED_CALENDAR_EVENT_TYPES = STORED_EVENT_TYPES;
