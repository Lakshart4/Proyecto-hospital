// Reglas puras de calendarios y eventos (Req. 4.2, 4.3, 10.2, 10.4, 10.5, 10.9, 10.11, 11.2, 28.1–28.8).
//
// Los calendarios combinan Eventos guardados con Eventos virtuales (cumpleaños, Días_Inhábiles,
// feriados y Entregas_de_Proveedor) en una forma común, `CalendarEvent`, con inicio y fin como instantes
// UTC. Los elementos de día completo (cumpleaños, Días_Inhábiles, feriados) ocupan su día natural en la
// zona institucional (ver domain/time.ts).

import { ConflictError, ValidationError, type AppError, type FieldError } from '../lib/errors';
import { EMPLOYEE_ROLES, SHIFTS, type DeliveryStatus, type EventType, type Role, type Shift, type StoredEventType } from './constants';
import {
  INSTITUTIONAL_TIME_ZONE,
  addDays,
  dayOfWeek,
  dayRange,
  isLeapYear,
  localDateOf,
  naturalDateOf,
  zonedTimeToUtc,
  type NaturalDate,
} from './time';

// ---------- Colores (Req. 10.2, 11.2, 28.8) ----------

/** Un color distinto por Tipo_de_Evento (diseño: azul, verde, naranja, rosa, violeta, gris, rojo oscuro). */
export const EVENT_COLORS: Readonly<Record<EventType, string>> = {
  general: '#2563eb',
  actividad: '#16a34a',
  entrega: '#ea580c',
  cumpleaños: '#db2777',
  'agenda individual': '#7c3aed',
  'día inhábil': '#6b7280',
  feriado: '#991b1b',
};

export function eventColor(type: EventType): string {
  return EVENT_COLORS[type];
}

// ---------- Forma común de los calendarios ----------

export type CalendarSource = 'event' | 'delivery' | 'birthday' | 'nonWorkingDay' | 'holiday';

export interface CalendarEvent {
  /** Identificador único dentro del calendario, por ejemplo "event:4" o "delivery:2". */
  id: string;
  source: CalendarSource;
  type: EventType;
  title: string;
  color: string;
  /** Verdadero para cumpleaños, Días_Inhábiles y feriados. */
  allDay: boolean;
  /** Fecha natural de los elementos de día completo. */
  date?: NaturalDate;
  start: Date;
  end: Date;
  /** Datos de la Entrega_de_Proveedor (Req. 28.8). */
  delivery?: { status: DeliveryStatus; supplierName: string; productName: string; quantityRequested: number };
}

const byStart = (a: CalendarEvent, b: CalendarEvent) => a.start.getTime() - b.start.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

const assertDate = (name: string, value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new RangeError(`${name} no es una fecha válida.`);
};

// ---------- Solape (Req. 10.11, 28.6) ----------

/** Un Evento se solapa con [from, to] si empieza a más tardar en `to` y termina como pronto en `from`. */
export function overlaps(ev: { start: Date; end: Date }, from: Date, to: Date): boolean {
  for (const [name, d] of [['start', ev.start], ['end', ev.end], ['from', from], ['to', to]] as const) assertDate(name, d);
  return ev.start.getTime() <= to.getTime() && ev.end.getTime() >= from.getTime();
}

// ---------- Conversión a CalendarEvent ----------

export interface EventLike {
  id: number;
  title: string;
  type: StoredEventType;
  startAt: Date;
  endAt: Date;
}

export interface NonWorkingDayLike {
  id: number;
  title: string;
  /** Fecha natural guardada como DateTime de medianoche UTC. */
  date: Date;
}

export interface HolidayLike {
  date: NaturalDate;
  name: string;
}

export interface CalendarDeliveryLike {
  id: number;
  status: DeliveryStatus;
  /** Instante de la fecha programada. */
  scheduledDate: Date;
  supplierName: string;
  productName: string;
  quantityRequested: number;
}

export const fromEvent = (e: EventLike): CalendarEvent => ({
  id: `event:${e.id}`,
  source: 'event',
  type: e.type,
  title: e.title,
  color: eventColor(e.type),
  allDay: false,
  start: e.startAt,
  end: e.endAt,
});

function allDayEvent(id: string, source: CalendarSource, type: EventType, title: string, date: NaturalDate, timeZone: string): CalendarEvent {
  const { start, end } = dayRange(date, timeZone);
  return { id, source, type, title, color: eventColor(type), allDay: true, date, start, end };
}

export const fromNonWorkingDay = (d: NonWorkingDayLike, timeZone = INSTITUTIONAL_TIME_ZONE): CalendarEvent =>
  allDayEvent(`nonWorkingDay:${d.id}`, 'nonWorkingDay', 'día inhábil', d.title, naturalDateOf(d.date), timeZone);

export const fromHoliday = (h: HolidayLike, timeZone = INSTITUTIONAL_TIME_ZONE): CalendarEvent =>
  allDayEvent(`holiday:${h.date}`, 'holiday', 'feriado', h.name, h.date, timeZone);

export const fromDelivery = (d: CalendarDeliveryLike): CalendarEvent => ({
  id: `delivery:${d.id}`,
  source: 'delivery',
  type: 'entrega',
  title: `Entrega: ${d.productName}`,
  color: eventColor('entrega'),
  allDay: false,
  start: d.scheduledDate,
  end: d.scheduledDate,
  delivery: { status: d.status, supplierName: d.supplierName, productName: d.productName, quantityRequested: d.quantityRequested },
});

/** Las entregas canceladas nunca aparecen en un calendario (Req. 28.7). */
const visibleDelivery = (d: CalendarDeliveryLike) => d.status === 'programada' || d.status === 'recibida';

// ---------- Calendarios general y de actividades (Req. 28.5–28.7) ----------

export interface CalendarRange {
  from: Date;
  to: Date;
}

export interface GeneralCalendarInput extends CalendarRange {
  events: readonly EventLike[];
  nonWorkingDays: readonly NonWorkingDayLike[];
  /** Feriados disponibles (vacío si Nager.Date no respondió). */
  holidays: readonly HolidayLike[];
  deliveries: readonly CalendarDeliveryLike[];
}

/**
 * Calendario general: Eventos "general", Días_Inhábiles, feriados disponibles y entregas "programada" o
 * "recibida" que se solapan con el rango, ordenados por inicio. Excluye las entregas canceladas.
 */
export function generalCalendar(input: GeneralCalendarInput, timeZone = INSTITUTIONAL_TIME_ZONE): CalendarEvent[] {
  const items = [
    ...input.events.filter((e) => e.type === 'general').map(fromEvent),
    ...input.nonWorkingDays.map((d) => fromNonWorkingDay(d, timeZone)),
    ...input.holidays.map((h) => fromHoliday(h, timeZone)),
    ...input.deliveries.filter(visibleDelivery).map(fromDelivery),
  ];
  return items.filter((i) => overlaps(i, input.from, input.to)).sort(byStart);
}

export interface ActivitiesCalendarInput extends CalendarRange {
  events: readonly EventLike[];
  deliveries: readonly CalendarDeliveryLike[];
}

/** Calendario de actividades y entregas: Eventos "actividad" y "entrega" y entregas visibles solapadas con el rango. */
export function activitiesCalendar(input: ActivitiesCalendarInput): CalendarEvent[] {
  const items = [
    ...input.events.filter((e) => e.type === 'actividad' || e.type === 'entrega').map(fromEvent),
    ...input.deliveries.filter(visibleDelivery).map(fromDelivery),
  ];
  return items.filter((i) => overlaps(i, input.from, input.to)).sort(byStart);
}

// ---------- Próximas entregas y actividades (Req. 4.2, 4.3) ----------

export const UPCOMING_LIMIT = 50;
export const UPCOMING_DAYS = 7;

/**
 * Eventos "entrega" o "actividad" y entregas "programada" cuyo inicio cae desde el comienzo de hoy hasta
 * el final del día hoy + 7 (días naturales en la zona institucional), por fecha ascendente, máximo 50.
 */
export function upcomingWindow(items: readonly CalendarEvent[], today: Date, timeZone = INSTITUTIONAL_TIME_ZONE): CalendarEvent[] {
  assertDate('today', today);
  const todayDate = localDateOf(today, timeZone);
  const from = dayRange(todayDate, timeZone).start.getTime();
  const to = dayRange(addDays(todayDate, UPCOMING_DAYS), timeZone).end.getTime();
  return items
    .filter((i) =>
      i.source === 'delivery' ? i.delivery?.status === 'programada' : i.source === 'event' && (i.type === 'entrega' || i.type === 'actividad'),
    )
    .filter((i) => i.start.getTime() >= from && i.start.getTime() <= to)
    .sort(byStart)
    .slice(0, UPCOMING_LIMIT);
}

// ---------- Personal: cumpleaños y turnos (Req. 10.5, 28.1, 28.2) ----------

export interface StaffLike {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  shift: Shift;
  /** Fecha natural guardada como DateTime de medianoche UTC. */
  birthDate: Date | null;
  schedule: readonly { dayOfWeek: number; startTime: string; endTime: string }[];
}

/** Solo los Empleados (DOCTOR, NURSE, CLEANING) activos; el Administrador no es Empleado. */
const isActiveEmployee = (s: StaffLike) => s.active && (EMPLOYEE_ROLES as readonly string[]).includes(s.role);

/**
 * Un cumpleaños por Empleado activo con fecha de nacimiento, en su día y mes del año indicado
 * (el 29 de febrero se muestra el 28 en años no bisiestos). La fecha de nacimiento se usa como fecha
 * natural, sin zona horaria.
 */
export function birthdayEvents(staff: readonly StaffLike[], year: number, timeZone = INSTITUTIONAL_TIME_ZONE): CalendarEvent[] {
  if (!Number.isSafeInteger(year) || year < 1 || year > 9999) throw new RangeError(`Año inválido: ${year}.`);
  return staff
    .filter((s) => isActiveEmployee(s) && s.birthDate !== null)
    .map((s) => {
      const [, month, day] = naturalDateOf(s.birthDate as Date).split('-').map(Number) as [number, number, number];
      const shownDay = month === 2 && day === 29 && !isLeapYear(year) ? 28 : day;
      const date = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(shownDay).padStart(2, '0')}`;
      return allDayEvent(`birthday:${s.id}:${year}`, 'birthday', 'cumpleaños', `Cumpleaños de ${s.name}`, date, timeZone);
    })
    .sort(byStart);
}

export interface ShiftEntry {
  userId: number;
  name: string;
  startTime: string;
  endTime: string;
  /** Entrada y salida como instantes UTC (hora institucional). */
  startAt: Date;
  endAt: Date;
}

export interface ShiftDay {
  date: NaturalDate;
  dayOfWeek: number;
  shifts: Partial<Record<Shift, ShiftEntry[]>>;
}

/** Máximo de días de un Calendario_de_Turnos, para acotar el cálculo. */
export const MAX_SHIFT_CALENDAR_DAYS = 366;

/**
 * Calendario_de_Turnos (Req. 28.1): para cada día natural (zona institucional) desde `from` hasta `to` y
 * cada Turno, los Empleados activos de ese Turno con entrada y salida del Horario_de_Trabajo de ese día
 * de la semana. Un Empleado sin horario ese día no aparece.
 * @throws RangeError si el rango supera 366 días.
 */
export function shiftCalendar(staff: readonly StaffLike[], from: Date, to: Date, timeZone = INSTITUTIONAL_TIME_ZONE): ShiftDay[] {
  assertDate('from', from);
  assertDate('to', to);
  const days: ShiftDay[] = [];
  const last = localDateOf(to, timeZone);
  for (let date = localDateOf(from, timeZone); date <= last; date = addDays(date, 1)) {
    if (days.length >= MAX_SHIFT_CALENDAR_DAYS) throw new RangeError(`El rango supera ${MAX_SHIFT_CALENDAR_DAYS} días.`);
    const weekday = dayOfWeek(date);
    const shifts: Partial<Record<Shift, ShiftEntry[]>> = {};
    for (const shift of SHIFTS) {
      shifts[shift] = staff
        .filter((s) => isActiveEmployee(s) && s.shift === shift)
        .flatMap((s) => {
          const slot = s.schedule.find((d) => d.dayOfWeek === weekday);
          if (!slot) return [];
          return [
            {
              userId: s.id,
              name: s.name,
              startTime: slot.startTime,
              endTime: slot.endTime,
              startAt: zonedTimeToUtc(date, slot.startTime, timeZone),
              endAt: zonedTimeToUtc(date, slot.endTime, timeZone),
            },
          ];
        })
        .sort((a, b) => a.startTime.localeCompare(b.startTime) || a.userId - b.userId);
    }
    days.push({ date, dayOfWeek: weekday, shifts });
  }
  return days;
}

/**
 * Calendario_de_Turnos según el actor (Req. 28.1, 28.2): el Administrador ve todos los Empleados activos;
 * un Empleado ve únicamente su propio Turno con su propio horario.
 */
export function shiftCalendarFor(
  actor: { id: number; role: Role },
  staff: readonly StaffLike[],
  from: Date,
  to: Date,
  timeZone = INSTITUTIONAL_TIME_ZONE,
): ShiftDay[] {
  if (actor.role === 'ADMIN') return shiftCalendar(staff, from, to, timeZone);
  const self = staff.find((s) => s.id === actor.id);
  const days = shiftCalendar(self ? [self] : [], from, to, timeZone);
  return days.map((d) => ({ ...d, shifts: self ? { [self.shift]: d.shifts[self.shift] ?? [] } : {} }));
}

// ---------- Validación de Evento y Día_Inhábil (Req. 10.4, 10.9, 28.3, 28.4) ----------

export const TITLE_MAX = 150;
export const DESCRIPTION_MAX = 500;

export const EVENT_MESSAGES = {
  titleRequired: 'El título es obligatorio.',
  titleTooLong: `El título debe tener como máximo ${TITLE_MAX} caracteres.`,
  descriptionTooLong: `La descripción debe tener como máximo ${DESCRIPTION_MAX} caracteres.`,
  dateRequired: 'La fecha es obligatoria.',
  endBeforeStart: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
  duplicateDate: 'Ya existe un día inhábil en esa fecha.',
} as const;

function titleErrors(title: unknown): FieldError[] {
  if (typeof title !== 'string' || title.trim() === '') return [{ field: 'title', message: EVENT_MESSAGES.titleRequired }];
  if (title.trim().length > TITLE_MAX) return [{ field: 'title', message: EVENT_MESSAGES.titleTooLong }];
  return [];
}

function descriptionErrors(description: unknown): FieldError[] {
  if (description === undefined || description === null) return [];
  if (typeof description !== 'string' || description.length > DESCRIPTION_MAX) {
    return [{ field: 'description', message: EVENT_MESSAGES.descriptionTooLong }];
  }
  return [];
}

const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

/**
 * Evento válido: título de 1 a 150 caracteres sin contar los espacios de los extremos, descripción
 * opcional de hasta 500, inicio y fin presentes y fin no anterior al inicio (Req. 10.4, 10.9).
 */
export function validateEvent(input: { title: unknown; description?: unknown; startAt: unknown; endAt: unknown }): FieldError[] {
  const errors = [...titleErrors(input.title), ...descriptionErrors(input.description)];
  const startOk = isValidDate(input.startAt);
  const endOk = isValidDate(input.endAt);
  if (!startOk) errors.push({ field: 'startAt', message: EVENT_MESSAGES.dateRequired });
  if (!endOk) errors.push({ field: 'endAt', message: EVENT_MESSAGES.dateRequired });
  if (startOk && endOk && (input.endAt as Date).getTime() < (input.startAt as Date).getTime()) {
    errors.push({ field: 'endAt', message: EVENT_MESSAGES.endBeforeStart });
  }
  return errors;
}

/**
 * Día_Inhábil válido (Req. 28.3, 28.4): título de 1 a 150 caracteres, descripción de 0 a 500 y fecha
 * presente que no coincide con la de otro Día_Inhábil (se ignora el propio `id` al editar).
 * Devuelve 400 con los campos inválidos, o 409 si la fecha ya está registrada.
 */
export function validateNonWorkingDay(
  input: { id?: number; title: unknown; description?: unknown; date: unknown },
  existing: readonly { id: number; date: Date }[],
): { ok: true } | { ok: false; error: AppError } {
  const errors = [...titleErrors(input.title), ...descriptionErrors(input.description)];
  if (!isValidDate(input.date)) errors.push({ field: 'date', message: EVENT_MESSAGES.dateRequired });
  if (errors.length > 0) return { ok: false, error: new ValidationError(undefined, errors) };
  const date = naturalDateOf(input.date as Date);
  if (existing.some((d) => d.id !== input.id && naturalDateOf(d.date) === date)) {
    return { ok: false, error: new ConflictError(EVENT_MESSAGES.duplicateDate) };
  }
  return { ok: true };
}
