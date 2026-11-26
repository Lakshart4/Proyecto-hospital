import { APPOINTMENT_STATUSES } from '../domain/constants';
import { parsePagination, toPage } from '../domain/others';
import { dayRange, naturalDateOf } from '../domain/time';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import {
  cancelAppointment,
  createAppointment,
  findAppointmentById,
  findAppointmentConflicts,
  listAppointments,
  updateAppointment,
  type AppointmentWriteData,
} from '../repositories/appointments.repository';
import type { Database } from '../repositories/database';
import { withTransaction, type DbClient } from '../repositories/transaction';
import type { AppointmentBody, AppointmentListQuery, CancelAppointmentBody } from '../schemas/appointments';
import type { Actor } from './staff.service';

export interface AppointmentsServiceOptions { db: Database; now?: () => Date }

const endOf = (start: Date, duration: number) => start.getTime() + duration * 60_000;

export function createAppointmentsService(options: AppointmentsServiceOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  const assertDoctorScope = (actor: Actor, doctorId: number) => {
    if (actor.role === 'DOCTOR' && actor.id !== doctorId) throw new ForbiddenError('No puedes gestionar citas de otro médico.');
  };

  const validateBody = async (tx: DbClient, actor: Actor, body: AppointmentBody, excludeId?: number) => {
    assertDoctorScope(actor, body.doctorId);
    if (body.scheduledAt.getTime() <= now().getTime()) {
      throw new ValidationError('La fecha de la cita debe ser posterior al momento actual.', [{ field: 'scheduledAt', message: 'Selecciona una fecha y hora futuras.' }]);
    }
    const [patient, doctor] = await Promise.all([
      tx.patient.findUnique({ where: { id: body.patientId }, select: { id: true, status: true } }),
      tx.user.findUnique({ where: { id: body.doctorId }, select: { id: true, role: true, active: true } }),
    ]);
    if (!patient) throw new ValidationError('El paciente indicado no existe.', [{ field: 'patientId', message: 'Selecciona un paciente existente.' }]);
    if (patient.status !== 'activo') throw new ConflictError('Solo se pueden programar citas para pacientes activos.');
    if (!doctor || doctor.role !== 'DOCTOR' || !doctor.active) {
      throw new ValidationError('El médico indicado no es válido.', [{ field: 'doctorId', message: 'Selecciona un médico activo.' }]);
    }

    const start = body.scheduledAt.getTime();
    const end = endOf(body.scheduledAt, body.durationMinutes);
    const candidates = await findAppointmentConflicts(tx, body.doctorId, body.patientId);
    for (const candidate of candidates) {
      if (candidate.id === excludeId) continue;
      const otherStart = candidate.scheduledAt.getTime();
      const otherEnd = endOf(candidate.scheduledAt, candidate.durationMinutes);
      if (start < otherEnd && otherStart < end) {
        throw new ConflictError(candidate.doctorId === body.doctorId
          ? 'El médico ya tiene una cita que se empalma con ese horario.'
          : 'El paciente ya tiene una cita que se empalma con ese horario.');
      }
    }
  };

  const requireAppointment = async (id: number, actor: Actor) => {
    const appointment = await findAppointmentById(db, id);
    if (!appointment) throw new NotFoundError('La cita no existe.');
    assertDoctorScope(actor, appointment.doctorId);
    return appointment;
  };

  return {
    async list(actor: Actor, query: AppointmentListQuery) {
      if (query.doctorId !== undefined) assertDoctorScope(actor, query.doctorId);
      const scopedDoctorId = actor.role === 'DOCTOR' ? actor.id : query.doctorId;
      const from = query.from ? dayRange(naturalDateOf(query.from)).start.getTime() : undefined;
      const to = query.to ? dayRange(naturalDateOf(query.to)).end.getTime() : undefined;
      if (from !== undefined && to !== undefined && from > to) {
        throw new ValidationError('La fecha inicial no puede ser posterior a la final.', [{ field: 'to', message: 'Revisa el rango de fechas.' }]);
      }
      const rows = (await listAppointments(db)).filter((appointment) => {
        const time = appointment.scheduledAt.getTime();
        return (scopedDoctorId === undefined || appointment.doctorId === scopedDoctorId)
          && (query.patientId === undefined || appointment.patientId === query.patientId)
          && (query.status === undefined || appointment.status === query.status)
          && (from === undefined || time >= from)
          && (to === undefined || time <= to);
      });
      const pagination = parsePagination(query as Record<string, unknown>);
      return toPage(rows.slice(pagination.skip, pagination.skip + pagination.take), rows.length, pagination);
    },

    async get(actor: Actor, id: number) {
      return requireAppointment(id, actor);
    },

    async create(actor: Actor, body: AppointmentBody) {
      return withTransaction(async (tx) => {
        await validateBody(tx, actor, body);
        const appointment = await createAppointment(tx, body as AppointmentWriteData, actor.id);
        await writeAudit(tx, {
          userId: actor.id, action: 'APPOINTMENT_CREATE', entityType: 'Appointment', entityId: appointment.id,
          details: { patientId: body.patientId, doctorId: body.doctorId, scheduledAt: body.scheduledAt.toISOString() },
        });
        return appointment;
      }, { client: db });
    },

    async update(actor: Actor, id: number, body: AppointmentBody) {
      await requireAppointment(id, actor);
      return withTransaction(async (tx) => {
        const current = await findAppointmentById(tx, id);
        if (!current) throw new NotFoundError('La cita no existe.');
        if (current.status !== 'programada') throw new ConflictError('Una cita cancelada no se puede editar.');
        await validateBody(tx, actor, body, id);
        const appointment = await updateAppointment(tx, id, body as AppointmentWriteData);
        await writeAudit(tx, {
          userId: actor.id, action: 'APPOINTMENT_UPDATE', entityType: 'Appointment', entityId: id,
          details: { patientId: body.patientId, doctorId: body.doctorId, scheduledAt: body.scheduledAt.toISOString() },
        });
        return appointment;
      }, { client: db });
    },

    async cancel(actor: Actor, id: number, body: CancelAppointmentBody) {
      await requireAppointment(id, actor);
      return withTransaction(async (tx) => {
        const current = await findAppointmentById(tx, id);
        if (!current) throw new NotFoundError('La cita no existe.');
        if (current.status !== 'programada') throw new ConflictError('La cita ya está cancelada.');
        const appointment = await cancelAppointment(tx, id, body.reason, now());
        await writeAudit(tx, {
          userId: actor.id, action: 'APPOINTMENT_CANCEL', entityType: 'Appointment', entityId: id,
          details: { reason: body.reason },
        });
        return appointment;
      }, { client: db });
    },

    statuses: APPOINTMENT_STATUSES,
  };
}

export type AppointmentsService = ReturnType<typeof createAppointmentsService>;
