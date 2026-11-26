// Servicio de Habitaciones, Asignaciones, liberaciones e Historial_de_Ocupación (Req. 9, 27).
//
// La disponibilidad no se guarda: se calcula con las Asignaciones activas y la capacidad mediante las
// reglas puras de `domain/rooms.ts`. Asignar y liberar se ejecutan en una transacción junto con el
// registro de auditoría; cualquier fallo revierte todo.

import { applyFilters, dateRange, equals } from '../domain/filters';
import { parsePagination, toPage } from '../domain/others';
import {
  ROOM_MESSAGES,
  activeCountOf,
  assignPatient,
  occupancyCounters,
  occupancySummary,
  releasePatient,
  roomAvailability,
  type AssignmentLike,
  type OccupancyState,
} from '../domain/rooms';
import type { PatientStatus, ReleaseReason } from '../domain/constants';
import { dayRange, localDateOf } from '../domain/time';
import { ConflictError, NotFoundError, ValidationError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  closeAssignment,
  createAssignment,
  createReleaseMovement,
  createRoom,
  deleteRoom,
  findPatientForRoom,
  findRoomById,
  listAssignments,
  listRooms,
  setPatientStatusForRelease,
  updateRoom,
  type RoomWriteData,
} from '../repositories/rooms.repository';
import { listDepartments } from '../repositories/staff.repository';
import { withTransaction, type DbClient } from '../repositories/transaction';
import type {
  OccupancyListQuery,
  OccupancySummaryQuery,
  ReleaseBody,
  RoomBody,
  RoomListQuery,
} from '../schemas/rooms';
import type { Actor } from './staff.service';

export interface RoomsServiceOptions {
  db: Database;
  now?: () => Date;
}

type AssignmentRow = Awaited<ReturnType<typeof listAssignments>>[number];

const toAssignmentLike = (row: AssignmentRow): AssignmentLike => ({
  roomId: row.roomId,
  patientId: row.patientId,
  departmentId: row.room.departmentId,
  startedAt: row.startedAt,
  endedAt: row.endedAt,
  releaseReason: row.releaseReason as ReleaseReason | null,
});

const toRoomLike = (row: Awaited<ReturnType<typeof listRooms>>[number]) => ({
  id: row.id,
  departmentId: row.departmentId,
  capacity: row.capacity,
});

export function createRoomsService(options: RoomsServiceOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  const requireRoom = async (id: number, client: Database | DbClient = db) => {
    const room = await findRoomById(client, id);
    if (room === null) throw new NotFoundError(ROOM_MESSAGES.roomNotFound);
    return room;
  };

  const roomRow = (room: Awaited<ReturnType<typeof listRooms>>[number], assignments: readonly AssignmentLike[]) => ({
    id: room.id,
    number: room.number,
    departmentId: room.departmentId,
    department: room.department,
    capacity: room.capacity,
    activeCount: activeCountOf(room.id, assignments),
    availability: roomAvailability(activeCountOf(room.id, assignments), room.capacity),
    patients: room.assignments.map((a) => ({
      assignmentId: a.id,
      patientId: a.patientId,
      internalId: a.patient.internalId,
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
      status: a.patient.status,
      startedAt: a.startedAt,
    })),
  });

  const roomDetails = async (id: number) => {
    const [room, assignments] = await Promise.all([requireRoom(id), listAssignments(db)]);
    return roomRow(room, assignments.map(toAssignmentLike));
  };

  const validateRange = (from: Date | undefined, to: Date | undefined) => {
    if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
      throw new ValidationError('Los datos enviados no son válidos.', [
        { field: 'to', message: 'La fecha final no puede ser anterior a la fecha inicial.' },
      ]);
    }
  };

  return {
    async list(query: RoomListQuery) {
      const [rooms, assignments, departments] = await Promise.all([listRooms(db), listAssignments(db), listDepartments(db)]);
      const departmentName = new Map(departments.map((d) => [d.id, d.name]));
      const likes = assignments.map(toAssignmentLike);
      const rows = rooms.map((room) => {
        const row = roomRow(room, likes);
        return { ...row, department: { id: room.departmentId, name: departmentName.get(room.departmentId) ?? '' } };
      });
      const filtered = applyFilters(rows, [
        equals((r) => r.departmentId, query.departmentId),
        equals((r) => r.availability, query.availability),
      ]);
      return { data: filtered };
    },

    async counters() {
      const [rooms, assignments, departments] = await Promise.all([listRooms(db), listAssignments(db), listDepartments(db)]);
      const counters = occupancyCounters(rooms.map(toRoomLike), assignments.map(toAssignmentLike));
      const departmentName = new Map(departments.map((d) => [d.id, d.name]));
      return {
        total: counters.total,
        byDepartment: counters.byDepartment.map((d) => ({
          ...d,
          departmentName: departmentName.get(d.departmentId) ?? '',
        })),
      };
    },

    async get(id: number) {
      return roomDetails(id);
    },

    async create(body: RoomBody) {
      const created = await createRoom(db, body);
      return roomDetails(created.id);
    },

    async update(id: number, body: RoomBody) {
      await withTransaction(
        async (tx) => {
          const room = await requireRoom(id, tx);
          const assignments = (await listAssignments(tx)).map(toAssignmentLike);
          const active = activeCountOf(room.id, assignments);
          if (body.capacity < active) {
            throw new ConflictError('La capacidad no puede ser menor que el número de pacientes asignados actualmente.');
          }
          await updateRoom(tx, id, body as RoomWriteData);
        },
        { client: db },
      );
      return roomDetails(id);
    },

    async remove(id: number) {
      await requireRoom(id);
      await deleteRoom(db, id);
    },

    async assign(actor: Actor, roomId: number, patientId: number) {
      return withTransaction(
        async (tx) => {
          const [room, patient, assignments] = await Promise.all([
            requireRoom(roomId, tx),
            findPatientForRoom(tx, patientId),
            listAssignments(tx),
          ]);
          const state: OccupancyState = {
            rooms: [toRoomLike(room)],
            patients: patient === null ? [] : [{ id: patient.id, status: patient.status as PatientStatus }],
            assignments: assignments.map(toAssignmentLike),
          };
          const result = assignPatient(state, { roomId, patientId }, now());
          if (!result.ok) throw result.error;

          const assignment = await createAssignment(tx, {
            roomId,
            patientId,
            startedAt: result.value.assignment.startedAt,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'ROOM_ASSIGN',
            entityType: 'Room',
            entityId: roomId,
            details: { patientId },
          });
          return { assignment, availability: result.value.availability };
        },
        { client: db },
      );
    },

    async release(actor: Actor, roomId: number, body: ReleaseBody) {
      return withTransaction(
        async (tx) => {
          const [room, patient, assignments] = await Promise.all([
            requireRoom(roomId, tx),
            findPatientForRoom(tx, body.patientId),
            listAssignments(tx),
          ]);
          const state: OccupancyState = {
            rooms: [toRoomLike(room)],
            patients: patient === null ? [] : [{ id: patient.id, status: patient.status as PatientStatus }],
            assignments: assignments.map(toAssignmentLike),
          };
          const at = now();
          const result = releasePatient(state, { roomId, patientId: body.patientId, reason: body.reason }, at);
          if (!result.ok) throw result.error;
          const active = assignments.find((a) => a.patientId === body.patientId && a.endedAt === null);
          if (active === undefined) throw new ConflictError(ROOM_MESSAGES.noActiveAssignment);

          const assignment = await closeAssignment(tx, active.id, {
            endedAt: result.value.assignment.endedAt as Date,
            releaseReason: body.reason,
          });
          const patientStatus = await setPatientStatusForRelease(tx, body.patientId, {
            status: result.value.patientStatus === 'dado de alta' ? 'dado de alta' : 'fallecido',
            deceasedAt: body.reason === 'fallecimiento' ? at : null,
          });
          await createReleaseMovement(tx, {
            patientId: body.patientId,
            type: result.value.movementType,
            occurredAt: at,
            departmentId: room.departmentId,
            userId: actor.id,
            note: body.note,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'ROOM_RELEASE',
            entityType: 'Room',
            entityId: roomId,
            details: { patientId: body.patientId, reason: body.reason },
          });
          return { assignment, patientStatus, availability: result.value.availability };
        },
        { client: db },
      );
    },

    async history(query: OccupancyListQuery) {
      validateRange(query.from, query.to);
      const pagination = parsePagination(query as Record<string, unknown>);
      const [assignments, departments] = await Promise.all([listAssignments(db), listDepartments(db)]);
      const departmentName = new Map(departments.map((d) => [d.id, d.name]));
      const rows = assignments.map((row) => ({
        ...row,
        departmentId: row.room.departmentId,
        departmentName: departmentName.get(row.room.departmentId) ?? '',
      }));
      const filtered = applyFilters(rows, [
        equals((r) => r.departmentId, query.departmentId),
        equals((r) => r.roomId, query.roomId),
        equals((r) => r.releaseReason, query.reason),
        dateRange((r) => r.startedAt, { from: query.from, to: query.to }),
      ]);
      return toPage(filtered.slice(pagination.skip, pagination.skip + pagination.take), filtered.length, pagination);
    },

    async summary(query: OccupancySummaryQuery) {
      validateRange(query.from, query.to);
      const [assignments, departments] = await Promise.all([listAssignments(db), listDepartments(db)]);
      const departmentName = new Map(departments.map((d) => [d.id, d.name]));
      const from = query.from === undefined ? undefined : dayRange(localDateOf(query.from)).start;
      const to = query.to === undefined ? undefined : dayRange(localDateOf(query.to)).end;
      const rows = occupancySummary(assignments.map(toAssignmentLike), { from, to })
        .filter((row) => query.departmentId === undefined || row.departmentId === query.departmentId)
        .map((row) => ({ ...row, departmentName: departmentName.get(row.departmentId) ?? '' }));
      return { data: rows };
    },
  };
}

export type RoomsService = ReturnType<typeof createRoomsService>;
