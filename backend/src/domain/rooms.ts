// Reglas puras de Habitaciones y ocupación (Req. 9.3–9.9, 9.13, 27.1, 27.3, 27.5).
//
// La Disponibilidad_de_Habitación no se guarda: se calcula con las Asignaciones activas y la capacidad.
// El modelo de asignar y liberar recibe el estado y la fecha actual (`now`) y devuelve un estado nuevo
// o un error tipado (400, 404 o 409) sin modificar la entrada. Los servicios aplican el resultado
// dentro de una transacción.

import { ConflictError, NotFoundError, ValidationError, type AppError } from '../lib/errors';
import {
  RELEASE_REASONS,
  type PatientMovementType,
  type PatientStatus,
  type ReleaseReason,
  type RoomAvailability,
} from './constants';
import type { DateRange } from './filters';

export interface RoomLike {
  id: number;
  departmentId: number;
  /** Capacidad de 1 a 10 Pacientes. */
  capacity: number;
}

export interface PatientLike {
  id: number;
  status: PatientStatus;
}

export interface AssignmentLike {
  roomId: number;
  patientId: number;
  /** Departamento de la Habitación de la Asignación. */
  departmentId: number;
  startedAt: Date;
  /** null mientras la Asignación está activa. */
  endedAt: Date | null;
  /** Motivo_de_Liberación: null mientras la Asignación está activa (Req. 27.3). */
  releaseReason: ReleaseReason | null;
}

export interface OccupancyState {
  rooms: readonly RoomLike[];
  patients: readonly PatientLike[];
  assignments: readonly AssignmentLike[];
}

export type RoomRuleResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

// ---------- Mensajes ----------

export const ROOM_MESSAGES = {
  roomNotFound: 'La habitación no existe.',
  patientNotFound: 'El paciente no existe.',
  roomOccupied: 'La habitación está ocupada.',
  patientHasActiveAssignment: 'El paciente ya tiene una asignación activa.',
  patientNotActive: 'El paciente no está activo.',
  noActiveAssignment: 'El paciente no tiene una asignación activa.',
  activeAssignmentInOtherRoom: 'El paciente no tiene una asignación activa en esta habitación.',
  invalidReason: 'El motivo de liberación debe ser "alta" o "fallecimiento".',
} as const;

// ---------- Disponibilidad ----------

function assertCount(name: string, value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} debe ser un entero mayor o igual a ${min} (recibido: ${value}).`);
  }
}

/**
 * Disponibilidad_de_Habitación (Req. 9.9): "ocupada" si las Asignaciones activas son iguales a la
 * capacidad y "disponible" si son menos.
 * @throws RangeError si hay más Asignaciones activas que capacidad (invariante violado) o si los
 * valores no son enteros válidos.
 */
export function roomAvailability(activeCount: number, capacity: number): RoomAvailability {
  assertCount('activeCount', activeCount, 0);
  assertCount('capacity', capacity, 1);
  if (activeCount > capacity) {
    throw new RangeError(`Hay más asignaciones activas (${activeCount}) que capacidad (${capacity}).`);
  }
  return activeCount === capacity ? 'ocupada' : 'disponible';
}

const isActive = (assignment: AssignmentLike) => assignment.endedAt === null;

/** Asignaciones activas de una Habitación. */
export function activeCountOf(roomId: number, assignments: readonly AssignmentLike[]): number {
  return assignments.filter((a) => a.roomId === roomId && isActive(a)).length;
}

// ---------- Asignar y liberar ----------

export interface AssignInput {
  roomId: number;
  patientId: number;
}

/**
 * Asigna un Paciente a una Habitación (Req. 9.3, 9.5–9.7). Errores, en este orden:
 * 404 si la Habitación o el Paciente no existen; 409 si el Paciente no está activo, si ya tiene una
 * Asignación activa o si la Habitación está ocupada. En caso de error el estado no cambia.
 */
export function assignPatient(
  state: OccupancyState,
  input: AssignInput,
  now: Date,
): RoomRuleResult<{ state: OccupancyState; assignment: AssignmentLike; availability: RoomAvailability }> {
  const room = state.rooms.find((r) => r.id === input.roomId);
  if (!room) return { ok: false, error: new NotFoundError(ROOM_MESSAGES.roomNotFound) };
  const patient = state.patients.find((p) => p.id === input.patientId);
  if (!patient) return { ok: false, error: new NotFoundError(ROOM_MESSAGES.patientNotFound) };

  if (patient.status !== 'activo') return { ok: false, error: new ConflictError(ROOM_MESSAGES.patientNotActive) };
  if (state.assignments.some((a) => a.patientId === patient.id && isActive(a))) {
    return { ok: false, error: new ConflictError(ROOM_MESSAGES.patientHasActiveAssignment) };
  }
  if (roomAvailability(activeCountOf(room.id, state.assignments), room.capacity) === 'ocupada') {
    return { ok: false, error: new ConflictError(ROOM_MESSAGES.roomOccupied) };
  }

  const assignment: AssignmentLike = {
    roomId: room.id,
    patientId: patient.id,
    departmentId: room.departmentId,
    startedAt: new Date(now.getTime()),
    endedAt: null,
    releaseReason: null,
  };
  const assignments = [...state.assignments, assignment];
  return {
    ok: true,
    value: {
      state: { rooms: state.rooms, patients: state.patients, assignments },
      assignment,
      availability: roomAvailability(activeCountOf(room.id, assignments), room.capacity),
    },
  };
}

export interface ReleaseInput {
  roomId: number;
  patientId: number;
  /** Se valida aquí: puede llegar cualquier valor desde la solicitud. */
  reason: unknown;
}

const isReleaseReason = (value: unknown): value is ReleaseReason =>
  typeof value === 'string' && (RELEASE_REASONS as readonly string[]).includes(value);

/** Estado del Paciente y tipo de movimiento que corresponden a cada Motivo_de_Liberación (Req. 9.4). */
export const RELEASE_OUTCOME: Readonly<Record<ReleaseReason, { status: PatientStatus; movementType: PatientMovementType }>> = {
  alta: { status: 'dado de alta', movementType: 'alta' },
  fallecimiento: { status: 'fallecido', movementType: 'fallecimiento' },
};

/**
 * Libera a un Paciente de una Habitación (Req. 9.4, 9.8, 9.13, 27.3). Errores, en este orden:
 * 400 si el motivo no es "alta" ni "fallecimiento"; 404 si la Habitación o el Paciente no existen;
 * 409 si el Paciente no tiene Asignación activa o si la tiene en otra Habitación.
 * Si todo es válido, cierra la Asignación con `now` y el motivo, y cambia el estado del Paciente.
 * En caso de error el estado no cambia.
 */
export function releasePatient(
  state: OccupancyState,
  input: ReleaseInput,
  now: Date,
): RoomRuleResult<{
  state: OccupancyState;
  assignment: AssignmentLike;
  patientStatus: PatientStatus;
  movementType: PatientMovementType;
  availability: RoomAvailability;
}> {
  if (!isReleaseReason(input.reason)) {
    return {
      ok: false,
      error: new ValidationError(ROOM_MESSAGES.invalidReason, [{ field: 'reason', message: ROOM_MESSAGES.invalidReason }]),
    };
  }
  const reason = input.reason;
  const room = state.rooms.find((r) => r.id === input.roomId);
  if (!room) return { ok: false, error: new NotFoundError(ROOM_MESSAGES.roomNotFound) };
  const patient = state.patients.find((p) => p.id === input.patientId);
  if (!patient) return { ok: false, error: new NotFoundError(ROOM_MESSAGES.patientNotFound) };

  const activeIndex = state.assignments.findIndex((a) => a.patientId === patient.id && isActive(a));
  if (activeIndex === -1) return { ok: false, error: new ConflictError(ROOM_MESSAGES.noActiveAssignment) };
  const active = state.assignments[activeIndex] as AssignmentLike;
  if (active.roomId !== room.id) return { ok: false, error: new ConflictError(ROOM_MESSAGES.activeAssignmentInOtherRoom) };
  if (patient.status !== 'activo') return { ok: false, error: new ConflictError(ROOM_MESSAGES.patientNotActive) };

  const closed: AssignmentLike = { ...active, endedAt: new Date(now.getTime()), releaseReason: reason };
  const assignments = state.assignments.map((a, index) => (index === activeIndex ? closed : a));
  const outcome = RELEASE_OUTCOME[reason];
  const patients = state.patients.map((p) => (p.id === patient.id ? { ...p, status: outcome.status } : p));
  return {
    ok: true,
    value: {
      state: { rooms: state.rooms, patients, assignments },
      assignment: closed,
      patientStatus: outcome.status,
      movementType: outcome.movementType,
      availability: roomAvailability(activeCountOf(room.id, assignments), room.capacity),
    },
  };
}

// ---------- Contadores (Req. 27.1) ----------

export interface OccupancyCount {
  occupied: number;
  available: number;
  total: number;
}

export interface OccupancyCounters {
  total: OccupancyCount;
  byDepartment: (OccupancyCount & { departmentId: number })[];
}

/**
 * Habitaciones ocupadas y disponibles, en total y por Departamento, calculadas con las Asignaciones
 * activas. Los Departamentos aparecen ordenados por id.
 */
export function occupancyCounters(rooms: readonly RoomLike[], assignments: readonly AssignmentLike[]): OccupancyCounters {
  const total: OccupancyCount = { occupied: 0, available: 0, total: 0 };
  const byDepartment = new Map<number, OccupancyCount & { departmentId: number }>();
  for (const room of rooms) {
    const occupied = roomAvailability(activeCountOf(room.id, assignments), room.capacity) === 'ocupada';
    const department = byDepartment.get(room.departmentId) ?? { departmentId: room.departmentId, occupied: 0, available: 0, total: 0 };
    for (const count of [total, department]) {
      count.total += 1;
      if (occupied) count.occupied += 1;
      else count.available += 1;
    }
    byDepartment.set(room.departmentId, department);
  }
  return { total, byDepartment: [...byDepartment.values()].sort((a, b) => a.departmentId - b.departmentId) };
}

// ---------- Resumen del Historial_de_Ocupación (Req. 27.5) ----------

export interface SummaryByDepartment {
  departmentId: number;
  /** Asignaciones con inicio dentro del rango. */
  started: number;
  /** Asignaciones activas actuales, sin aplicar el rango. */
  active: number;
  /** Liberaciones con fin dentro del rango y motivo "alta". */
  releasedByDischarge: number;
  /** Liberaciones con fin dentro del rango y motivo "fallecimiento". */
  releasedByDeath: number;
}

/** Instante dentro del rango: `from <= instante <= to`, con cada extremo opcional. */
function withinRange(instant: Date, range: DateRange): boolean {
  const time = instant.getTime();
  if (range.from !== undefined && time < range.from.getTime()) return false;
  if (range.to !== undefined && time > range.to.getTime()) return false;
  return true;
}

/**
 * Resumen por Departamento (Req. 27.5). Compara instantes con los límites recibidos, ambos incluidos y
 * opcionales. Solo aparecen los Departamentos que tienen alguna Asignación, ordenados por id.
 */
export function occupancySummary(assignments: readonly AssignmentLike[], range: DateRange): SummaryByDepartment[] {
  for (const bound of [range.from, range.to]) {
    if (bound !== undefined && Number.isNaN(bound.getTime())) throw new RangeError('Fecha del rango inválida.');
  }
  const byDepartment = new Map<number, SummaryByDepartment>();
  for (const a of assignments) {
    const summary = byDepartment.get(a.departmentId) ?? {
      departmentId: a.departmentId,
      started: 0,
      active: 0,
      releasedByDischarge: 0,
      releasedByDeath: 0,
    };
    if (withinRange(a.startedAt, range)) summary.started += 1;
    if (isActive(a)) summary.active += 1;
    else if (a.endedAt !== null && withinRange(a.endedAt, range)) {
      if (a.releaseReason === 'alta') summary.releasedByDischarge += 1;
      if (a.releaseReason === 'fallecimiento') summary.releasedByDeath += 1;
    }
    byDepartment.set(a.departmentId, summary);
  }
  return [...byDepartment.values()].sort((a, b) => a.departmentId - b.departmentId);
}
