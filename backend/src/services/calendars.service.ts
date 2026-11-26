// Servicio de Calendarios, Eventos, Días_Inhábiles y Feriados (Req. 10, 11, 28).
//
// Combina Eventos guardados con Eventos virtuales (cumpleaños, Días_Inhábiles, feriados y entregas)
// mediante las reglas puras de `domain/events.ts`. Los rangos se interpretan como días naturales en la
// zona institucional. La agenda individual solo se puede modificar por su propietario.

import type { DeliveryStatus, Role, StoredEventType } from '../domain/constants';
import {
  activitiesCalendar,
  birthdayEvents,
  fromEvent,
  generalCalendar,
  overlaps,
  shiftCalendarFor,
  validateEvent,
  validateNonWorkingDay,
  type CalendarDeliveryLike,
  type CalendarEvent,
  type EventLike,
  type StaffLike,
} from '../domain/events';
import { canManageAgenda, canReadAgenda } from '../domain/permissions';
import { INSTITUTIONAL_TIME_ZONE, dayRange, localDateOf, naturalDateOf, naturalDateToStored } from '../domain/time';
import { ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { listDeliveries } from '../repositories/deliveries.repository';
import {
  createEvent,
  createNonWorkingDay,
  deleteEvent,
  deleteNonWorkingDay,
  findCalendarStaffById,
  findEventById,
  findNonWorkingDayById,
  listAgendaTreatments,
  listCalendarStaff,
  listEvents,
  listNonWorkingDays,
  listPersonalEvents,
  updateEvent,
  updateNonWorkingDay,
} from '../repositories/calendars.repository';
import type { Database } from '../repositories/database';
import { withTransaction } from '../repositories/transaction';
import type {
  AgendaQuery,
  BirthdaysQuery,
  CalendarRangeQuery,
  EventBody,
  HolidaysQuery,
  NonWorkingDayBody,
  PersonalEventBody,
} from '../schemas/calendars';
import type { HolidaysResult, HolidayService } from './holidays.service';
import type { Actor } from './staff.service';

export const CALENDAR_MESSAGES = {
  eventNotFound: 'El evento no existe.',
  nonWorkingDayNotFound: 'El día inhábil no existe.',
  staffNotFound: 'El empleado no existe.',
  rangeTooLong: 'El rango no puede superar 366 días.',
  invalidRange: 'La fecha final no puede ser anterior a la fecha inicial.',
} as const;

export interface CalendarsServiceOptions {
  db: Database;
  holidays: HolidayService;
}

type EventRow = Awaited<ReturnType<typeof listEvents>>[number];
type DeliveryRow = Awaited<ReturnType<typeof listDeliveries>>[number];
type StaffRow = Awaited<ReturnType<typeof listCalendarStaff>>[number];

const eventLike = (row: EventRow): EventLike => ({
  id: row.id,
  title: row.title,
  type: row.type as StoredEventType,
  startAt: row.startAt,
  endAt: row.endAt,
});

const deliveryLike = (row: DeliveryRow): CalendarDeliveryLike => ({
  id: row.id,
  status: row.status as DeliveryStatus,
  scheduledDate: row.scheduledDate,
  supplierName: row.supplier.name,
  productName: row.product.name,
  quantityRequested: row.quantityRequested,
});

const staffLike = (row: StaffRow): StaffLike => ({
  id: row.id,
  name: row.name,
  role: row.role as Role,
  active: row.active,
  shift: row.shift as StaffLike['shift'],
  birthDate: row.birthDate,
  schedule: row.scheduleSlots,
});

/** Rango inclusivo de días naturales en la zona institucional. */
export function calendarRangeOf(query: CalendarRangeQuery): { from: Date; to: Date } {
  const fromDate = localDateOf(query.from, INSTITUTIONAL_TIME_ZONE);
  const toDate = localDateOf(query.to, INSTITUTIONAL_TIME_ZONE);
  if (fromDate > toDate) {
    throw new ValidationError(CALENDAR_MESSAGES.invalidRange, [
      { field: 'to', message: CALENDAR_MESSAGES.invalidRange },
    ]);
  }
  return {
    from: dayRange(fromDate, INSTITUTIONAL_TIME_ZONE).start,
    to: dayRange(toDate, INSTITUTIONAL_TIME_ZONE).end,
  };
}

export function createCalendarsService(options: CalendarsServiceOptions) {
  const { db, holidays } = options;

  const holidaysFor = async (from: Date, to: Date): Promise<HolidaysResult> => {
    const firstYear = Number(localDateOf(from, INSTITUTIONAL_TIME_ZONE).slice(0, 4));
    const lastYear = Number(localDateOf(to, INSTITUTIONAL_TIME_ZONE).slice(0, 4));
    const years: number[] = [];
    for (let year = firstYear; year <= lastYear; year += 1) years.push(year);
    const results = await Promise.all(years.map((year) => holidays.getHolidays(year)));
    return {
      available: results.every((result) => result.available),
      data: results.flatMap((result) => result.data),
    };
  };

  const requireEvent = async (id: number) => {
    const event = await findEventById(db, id);
    if (event === null) throw new NotFoundError(CALENDAR_MESSAGES.eventNotFound);
    return event;
  };

  const requireNonWorkingDay = async (id: number) => {
    const day = await findNonWorkingDayById(db, id);
    if (day === null) throw new NotFoundError(CALENDAR_MESSAGES.nonWorkingDayNotFound);
    return day;
  };

  const assertEventValid = (body: { title: string; description?: string; startAt: Date; endAt: Date }) => {
    const errors = validateEvent(body);
    if (errors.length > 0) throw new ValidationError('Los datos enviados no son válidos.', errors);
  };

  return {
    async general(query: CalendarRangeQuery): Promise<{ data: CalendarEvent[]; available: boolean }> {
      const { from, to } = calendarRangeOf(query);
      const [events, nonWorkingDays, deliveries, holidayResult] = await Promise.all([
        listEvents(db),
        listNonWorkingDays(db),
        listDeliveries(db),
        holidaysFor(from, to),
      ]);
      return {
        data: generalCalendar({
          from,
          to,
          events: events.map(eventLike),
          nonWorkingDays,
          holidays: holidayResult.data,
          deliveries: deliveries.map(deliveryLike),
        }),
        available: holidayResult.available,
      };
    },

    async activities(query: CalendarRangeQuery): Promise<{ data: CalendarEvent[] }> {
      const { from, to } = calendarRangeOf(query);
      const [events, deliveries] = await Promise.all([listEvents(db), listDeliveries(db)]);
      return {
        data: activitiesCalendar({
          from,
          to,
          events: events.map(eventLike),
          deliveries: deliveries.map(deliveryLike),
        }),
      };
    },

    async birthdays(query: BirthdaysQuery): Promise<{ data: CalendarEvent[] }> {
      const staff = await listCalendarStaff(db);
      return { data: birthdayEvents(staff.map(staffLike), query.year) };
    },

    async shifts(actor: Actor, query: CalendarRangeQuery) {
      const { from, to } = calendarRangeOf(query);
      const staff = await listCalendarStaff(db);
      try {
        return { data: shiftCalendarFor(actor, staff.map(staffLike), from, to) };
      } catch (error) {
        if (error instanceof RangeError) {
          throw new ValidationError(CALENDAR_MESSAGES.rangeTooLong, [
            { field: 'from', message: CALENDAR_MESSAGES.rangeTooLong },
          ]);
        }
        throw error;
      }
    },

    async agenda(actor: Actor, query: AgendaQuery) {
      if (query.userId !== undefined && actor.role !== 'ADMIN') throw new ForbiddenError();
      const ownerId = query.userId ?? actor.id;
      if (!canReadAgenda(actor, ownerId)) throw new ForbiddenError();
      const staff = await findCalendarStaffById(db, ownerId);
      if (staff === null) throw new NotFoundError(CALENDAR_MESSAGES.staffNotFound);

      const { from, to } = calendarRangeOf(query);
      const [personal, treatments] = await Promise.all([
        listPersonalEvents(db, ownerId),
        listAgendaTreatments(db, { id: ownerId, role: staff.role as Role }, from, to),
      ]);
      return {
        data: {
          userId: ownerId,
          schedule: staff.scheduleSlots,
          events: personal
            .map(eventLike)
            .map(fromEvent)
            .filter((event) => overlaps(event, from, to)),
          treatments,
        },
      };
    },

    async createEvent(actor: Actor, body: EventBody) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError();
      assertEventValid(body);
      return withTransaction(
        (tx) =>
          createEvent(tx, {
            title: body.title,
            description: body.description ?? null,
            type: body.type,
            startAt: body.startAt,
            endAt: body.endAt,
            ownerId: null,
            createdById: actor.id,
          }),
        { client: db },
      );
    },

    async updateEvent(actor: Actor, id: number, body: EventBody) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError();
      const event = await requireEvent(id);
      if (event.type === 'agenda individual') throw new NotFoundError(CALENDAR_MESSAGES.eventNotFound);
      assertEventValid(body);
      return withTransaction(
        (tx) =>
          updateEvent(tx, id, {
            title: body.title,
            description: body.description ?? null,
            type: body.type,
            startAt: body.startAt,
            endAt: body.endAt,
          }),
        { client: db },
      );
    },

    async removeEvent(actor: Actor, id: number) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError();
      const event = await requireEvent(id);
      if (event.type === 'agenda individual') throw new NotFoundError(CALENDAR_MESSAGES.eventNotFound);
      await withTransaction((tx) => deleteEvent(tx, id), { client: db });
    },

    async createPersonal(actor: Actor, body: PersonalEventBody) {
      assertEventValid(body);
      return withTransaction(
        (tx) =>
          createEvent(tx, {
            title: body.title,
            description: body.description ?? null,
            type: 'agenda individual',
            startAt: body.startAt,
            endAt: body.endAt,
            ownerId: actor.id,
            createdById: actor.id,
          }),
        { client: db },
      );
    },

    async updatePersonal(actor: Actor, id: number, body: PersonalEventBody) {
      const event = await requireEvent(id);
      if (event.type !== 'agenda individual' || event.ownerId === null) {
        throw new NotFoundError(CALENDAR_MESSAGES.eventNotFound);
      }
      if (!canManageAgenda(actor, event.ownerId)) throw new ForbiddenError();
      assertEventValid(body);
      return withTransaction(
        (tx) =>
          updateEvent(tx, id, {
            title: body.title,
            description: body.description ?? null,
            type: 'agenda individual',
            startAt: body.startAt,
            endAt: body.endAt,
          }),
        { client: db },
      );
    },

    async removePersonal(actor: Actor, id: number) {
      const event = await requireEvent(id);
      if (event.type !== 'agenda individual' || event.ownerId === null) {
        throw new NotFoundError(CALENDAR_MESSAGES.eventNotFound);
      }
      if (!canManageAgenda(actor, event.ownerId)) throw new ForbiddenError();
      await withTransaction((tx) => deleteEvent(tx, id), { client: db });
    },

    async listNonWorkingDays() {
      return { data: await listNonWorkingDays(db) };
    },

    async createNonWorkingDay(actor: Actor, body: NonWorkingDayBody) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError();
      const existing = await listNonWorkingDays(db);
      const validation = validateNonWorkingDay(body, existing);
      if (!validation.ok) throw validation.error;
      return withTransaction(
        (tx) =>
          createNonWorkingDay(tx, {
            date: naturalDateToStored(naturalDateOf(body.date)),
            title: body.title,
            description: body.description,
            createdById: actor.id,
          }),
        { client: db },
      );
    },

    async updateNonWorkingDay(actor: Actor, id: number, body: NonWorkingDayBody) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError();
      await requireNonWorkingDay(id);
      const existing = await listNonWorkingDays(db);
      const validation = validateNonWorkingDay({ id, ...body }, existing);
      if (!validation.ok) throw validation.error;
      return withTransaction(
        (tx) =>
          updateNonWorkingDay(tx, id, {
            date: naturalDateToStored(naturalDateOf(body.date)),
            title: body.title,
            description: body.description,
          }),
        { client: db },
      );
    },

    async removeNonWorkingDay(actor: Actor, id: number) {
      if (actor.role !== 'ADMIN') throw new ForbiddenError();
      await requireNonWorkingDay(id);
      await withTransaction((tx) => deleteNonWorkingDay(tx, id), { client: db });
    },

    async holidays(query: HolidaysQuery) {
      return holidays.getHolidays(query.year);
    },
  };
}

export type CalendarsService = ReturnType<typeof createCalendarsService>;
