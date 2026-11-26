import type { Database } from './database';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

const appointmentInclude = {
  patient: { select: { id: true, internalId: true, firstName: true, lastName: true, status: true, departmentId: true } },
  doctor: { select: { id: true, internalId: true, name: true, active: true } },
} as const;

export async function listAppointments(db: Client) {
  return db.appointment.findMany({ include: appointmentInclude, orderBy: { scheduledAt: 'asc' } });
}

export async function findAppointmentById(db: Client, id: number) {
  return db.appointment.findUnique({ where: { id }, include: appointmentInclude });
}

export async function findAppointmentConflicts(db: Client, doctorId: number, patientId: number) {
  return db.appointment.findMany({
    where: { status: 'programada', OR: [{ doctorId }, { patientId }] },
    select: { id: true, doctorId: true, patientId: true, scheduledAt: true, durationMinutes: true },
  });
}

export interface AppointmentWriteData {
  patientId: number;
  doctorId: number;
  scheduledAt: Date;
  durationMinutes: number;
  reason: string;
  notes: string;
}

export async function createAppointment(db: DbClient, data: AppointmentWriteData, createdById: number) {
  return db.appointment.create({ data: { ...data, createdById }, include: appointmentInclude });
}

export async function updateAppointment(db: DbClient, id: number, data: AppointmentWriteData) {
  return db.appointment.update({ where: { id }, data, include: appointmentInclude });
}

export async function cancelAppointment(db: DbClient, id: number, reason: string, canceledAt: Date) {
  return db.appointment.update({
    where: { id },
    data: { status: 'cancelada', cancelReason: reason || null, canceledAt },
    include: appointmentInclude,
  });
}
