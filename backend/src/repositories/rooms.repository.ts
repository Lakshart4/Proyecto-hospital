// Acceso a datos de Habitaciones, Asignaciones e Historial_de_Ocupación (Req. 9, 27).

import type { ReleaseReason } from '../domain/constants';
import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

export const ROOM_SELECT = {
  id: true,
  number: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  capacity: true,
  assignments: {
    where: { endedAt: null },
    orderBy: { startedAt: 'asc' },
    select: {
      id: true,
      patientId: true,
      startedAt: true,
      patient: { select: { id: true, internalId: true, firstName: true, lastName: true, status: true } },
    },
  },
} as const;

export const ASSIGNMENT_SELECT = {
  id: true,
  roomId: true,
  patientId: true,
  startedAt: true,
  endedAt: true,
  releaseReason: true,
  room: { select: { id: true, number: true, departmentId: true, department: { select: { id: true, name: true } } } },
  patient: { select: { id: true, internalId: true, firstName: true, lastName: true, status: true } },
} as const;

export async function listRooms(db: Client) {
  return db.room.findMany({ select: ROOM_SELECT, orderBy: { number: 'asc' } });
}

export async function findRoomById(db: Client, id: number) {
  return db.room.findUnique({ where: { id }, select: ROOM_SELECT });
}

export async function listAssignments(db: Client) {
  return db.roomAssignment.findMany({ select: ASSIGNMENT_SELECT, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] });
}

export async function findAssignmentById(db: Client, id: number) {
  return db.roomAssignment.findUnique({ where: { id }, select: ASSIGNMENT_SELECT });
}

export async function findPatientForRoom(db: Client, id: number) {
  return db.patient.findUnique({ where: { id }, select: { id: true, status: true } });
}

export interface RoomWriteData {
  number: number;
  departmentId: number;
  capacity: number;
}

export async function createRoom(tx: DbClient, data: RoomWriteData) {
  return runWithDbErrors({ operation: 'create', referenceField: 'departmentId' }, () =>
    tx.room.create({ data, select: ROOM_SELECT }),
  );
}

export async function updateRoom(tx: DbClient, id: number, data: RoomWriteData) {
  return runWithDbErrors({ operation: 'update', referenceField: 'departmentId' }, () =>
    tx.room.update({ where: { id }, data, select: ROOM_SELECT }),
  );
}

export async function deleteRoom(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.room.delete({ where: { id } }));
}

export async function createAssignment(tx: DbClient, data: { roomId: number; patientId: number; startedAt: Date }) {
  return runWithDbErrors({ operation: 'create' }, () =>
    tx.roomAssignment.create({
      data: { roomId: data.roomId, patientId: data.patientId, startedAt: data.startedAt },
      select: ASSIGNMENT_SELECT,
    }),
  );
}

export async function closeAssignment(
  tx: DbClient,
  id: number,
  data: { endedAt: Date; releaseReason: ReleaseReason },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.roomAssignment.update({ where: { id }, data, select: ASSIGNMENT_SELECT }),
  );
}

export async function setPatientStatusForRelease(
  tx: DbClient,
  id: number,
  data: { status: 'dado de alta' | 'fallecido'; deceasedAt: Date | null },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.patient.update({ where: { id }, data, select: { id: true, status: true, deceasedAt: true } }),
  );
}

export async function createReleaseMovement(
  tx: DbClient,
  data: { patientId: number; type: string; occurredAt: Date; departmentId: number; userId: number; note: string },
) {
  return runWithDbErrors({ operation: 'create' }, () =>
    tx.patientMovement.create({
      data,
      select: { id: true, patientId: true, type: true, occurredAt: true, departmentId: true, userId: true, note: true },
    }),
  );
}
