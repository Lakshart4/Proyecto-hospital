// Acceso a datos de Eventos, Días_Inhábiles y de la agenda individual (Req. 10, 28).

import type { Role, Shift } from '../domain/constants';
import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

export const EVENT_SELECT = {
  id: true,
  title: true,
  description: true,
  type: true,
  startAt: true,
  endAt: true,
  ownerId: true,
  createdById: true,
} as const;

export const NON_WORKING_DAY_SELECT = {
  id: true,
  date: true,
  title: true,
  description: true,
  createdById: true,
} as const;

export const CALENDAR_STAFF_SELECT = {
  id: true,
  name: true,
  role: true,
  active: true,
  shift: true,
  birthDate: true,
  scheduleSlots: {
    orderBy: { dayOfWeek: 'asc' as const },
    select: {
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      mealStart: true,
      mealEnd: true,
      breaks: { orderBy: { startTime: 'asc' as const }, select: { startTime: true, endTime: true } },
    },
  },
} as const;

export async function listEvents(db: Client) {
  return db.event.findMany({ select: EVENT_SELECT, orderBy: [{ startAt: 'asc' }, { id: 'asc' }] });
}

export async function listPersonalEvents(db: Client, ownerId: number) {
  return db.event.findMany({
    where: { type: 'agenda individual', ownerId },
    select: EVENT_SELECT,
    orderBy: [{ startAt: 'asc' }, { id: 'asc' }],
  });
}

export async function findEventById(db: Client, id: number) {
  return db.event.findUnique({ where: { id }, select: EVENT_SELECT });
}

export interface EventWriteData {
  title: string;
  description: string | null;
  type: string;
  startAt: Date;
  endAt: Date;
  ownerId: number | null;
  createdById: number;
}

export async function createEvent(tx: DbClient, data: EventWriteData) {
  return runWithDbErrors({ operation: 'create' }, () => tx.event.create({ data, select: EVENT_SELECT }));
}

export async function updateEvent(tx: DbClient, id: number, data: Omit<EventWriteData, 'createdById' | 'ownerId'>) {
  return runWithDbErrors({ operation: 'update' }, () => tx.event.update({ where: { id }, data, select: EVENT_SELECT }));
}

export async function deleteEvent(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.event.delete({ where: { id } }));
}

export async function listNonWorkingDays(db: Client) {
  return db.nonWorkingDay.findMany({ select: NON_WORKING_DAY_SELECT, orderBy: { date: 'asc' } });
}

export async function findNonWorkingDayById(db: Client, id: number) {
  return db.nonWorkingDay.findUnique({ where: { id }, select: NON_WORKING_DAY_SELECT });
}

export async function createNonWorkingDay(
  tx: DbClient,
  data: { date: Date; title: string; description: string; createdById: number },
) {
  return runWithDbErrors({ operation: 'create' }, () =>
    tx.nonWorkingDay.create({ data, select: NON_WORKING_DAY_SELECT }),
  );
}

export async function updateNonWorkingDay(
  tx: DbClient,
  id: number,
  data: { date: Date; title: string; description: string },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.nonWorkingDay.update({ where: { id }, data, select: NON_WORKING_DAY_SELECT }),
  );
}

export async function deleteNonWorkingDay(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.nonWorkingDay.delete({ where: { id } }));
}

export async function listCalendarStaff(db: Client) {
  return db.user.findMany({
    where: { role: { not: 'ADMIN' } },
    select: CALENDAR_STAFF_SELECT,
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });
}

export async function findCalendarStaffById(db: Client, id: number) {
  return db.user.findUnique({ where: { id }, select: CALENDAR_STAFF_SELECT });
}

export const AGENDA_TREATMENT_SELECT = {
  id: true,
  type: true,
  status: true,
  scheduledAt: true,
  description: true,
  patient: { select: { id: true, internalId: true, firstName: true, lastName: true } },
} as const;

export async function listAgendaTreatments(db: Client, actor: { id: number; role: Role }, from: Date, to: Date) {
  if (actor.role !== 'DOCTOR' && actor.role !== 'NURSE') return [];
  const responsible = actor.role === 'DOCTOR' ? { doctorId: actor.id } : { nurseId: actor.id };
  return db.treatment.findMany({
    where: {
      status: 'programado',
      scheduledAt: { gte: from, lte: to },
      patient: responsible,
    },
    select: AGENDA_TREATMENT_SELECT,
    orderBy: [{ scheduledAt: 'asc' }, { id: 'asc' }],
  });
}

export type CalendarStaffRow = {
  id: number;
  name: string;
  role: Role;
  active: boolean;
  shift: Shift;
  birthDate: Date | null;
  scheduleSlots: { dayOfWeek: number; startTime: string; endTime: string }[];
};
