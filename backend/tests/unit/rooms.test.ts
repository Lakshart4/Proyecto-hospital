// Pruebas de las reglas puras de Habitaciones y ocupación (tarea 3.8).
// Las propiedades 18, 19 y 20 corresponden a las tareas 3.9 y posteriores.

import { describe, expect, it } from 'vitest';
import {
  ROOM_MESSAGES,
  assignPatient,
  occupancyCounters,
  occupancySummary,
  releasePatient,
  roomAvailability,
  type AssignmentLike,
  type OccupancyState,
} from '../../src/domain/rooms';

const NOW = new Date('2026-03-10T15:30:00Z');

const active = (roomId: number, patientId: number, departmentId = 1, startedAt = '2026-03-01T08:00:00Z'): AssignmentLike => ({
  roomId,
  patientId,
  departmentId,
  startedAt: new Date(startedAt),
  endedAt: null,
  releaseReason: null,
});

/** Estado base: Habitación 1 (capacidad 2, una activa), Habitación 2 (capacidad 1, llena), Habitación 3 libre. */
function baseState(): OccupancyState {
  return {
    rooms: [
      { id: 1, departmentId: 1, capacity: 2 },
      { id: 2, departmentId: 1, capacity: 1 },
      { id: 3, departmentId: 2, capacity: 3 },
    ],
    patients: [
      { id: 10, status: 'activo' }, // con Asignación activa en la Habitación 1
      { id: 11, status: 'activo' }, // con Asignación activa en la Habitación 2
      { id: 12, status: 'activo' }, // sin Asignación
      { id: 13, status: 'dado de alta' },
      { id: 14, status: 'fallecido' },
    ],
    assignments: [active(1, 10), active(2, 11)],
  };
}

function expectError(result: { ok: boolean; error?: { status: number; message: string } }, status: number, message: string) {
  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error?.status).toBe(status);
  expect(result.error?.message).toBe(message);
}

describe('roomAvailability', () => {
  it('es "disponible" con menos activas que capacidad y "ocupada" al alcanzarla', () => {
    expect(roomAvailability(0, 1)).toBe('disponible');
    expect(roomAvailability(1, 1)).toBe('ocupada');
    expect(roomAvailability(0, 10)).toBe('disponible');
    expect(roomAvailability(9, 10)).toBe('disponible');
    expect(roomAvailability(10, 10)).toBe('ocupada');
  });

  it('lanza RangeError si hay más activas que capacidad', () => {
    expect(() => roomAvailability(2, 1)).toThrow(RangeError);
    expect(() => roomAvailability(11, 10)).toThrow(RangeError);
  });

  it('lanza RangeError con valores que no son enteros válidos', () => {
    expect(() => roomAvailability(-1, 2)).toThrow(RangeError);
    expect(() => roomAvailability(1.5, 2)).toThrow(RangeError);
    expect(() => roomAvailability(0, 0)).toThrow(RangeError);
    expect(() => roomAvailability(0, Number.NaN)).toThrow(RangeError);
  });
});

describe('assignPatient', () => {
  it('asigna a un Paciente activo sin Asignación a una Habitación disponible', () => {
    const state = baseState();
    const copy = structuredClone(state);
    const result = assignPatient(state, { roomId: 1, patientId: 12 }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignment).toEqual({
      roomId: 1,
      patientId: 12,
      departmentId: 1,
      startedAt: NOW,
      endedAt: null,
      releaseReason: null,
    });
    expect(result.value.state.assignments).toHaveLength(3);
    // La Habitación 1 (capacidad 2) queda llena con la segunda Asignación activa.
    expect(result.value.availability).toBe('ocupada');
    expect(state).toEqual(copy);
  });

  it('una Habitación con plaza libre sigue disponible tras asignar', () => {
    const result = assignPatient(baseState(), { roomId: 3, patientId: 12 }, NOW);
    expect(result.ok && result.value.availability).toBe('disponible');
    expect(result.ok && result.value.assignment.departmentId).toBe(2);
  });

  it.each([
    [13, 'dado de alta'],
    [14, 'fallecido'],
  ])('rechaza con 409 a un Paciente no activo (%s, %s)', (patientId) => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(assignPatient(state, { roomId: 3, patientId }, NOW), 409, ROOM_MESSAGES.patientNotActive);
    expect(state).toEqual(copy);
  });

  it('rechaza con 409 a un Paciente que ya tiene una Asignación activa', () => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(assignPatient(state, { roomId: 3, patientId: 10 }, NOW), 409, ROOM_MESSAGES.patientHasActiveAssignment);
    expect(state).toEqual(copy);
  });

  it('rechaza con 409 la asignación a una Habitación ocupada', () => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(assignPatient(state, { roomId: 2, patientId: 12 }, NOW), 409, ROOM_MESSAGES.roomOccupied);
    expect(state).toEqual(copy);
  });

  it('respeta el orden de errores: no activo, con Asignación activa, Habitación ocupada', () => {
    const state = baseState();
    // Paciente no activo y Habitación ocupada: gana "no activo".
    expectError(assignPatient(state, { roomId: 2, patientId: 13 }, NOW), 409, ROOM_MESSAGES.patientNotActive);
    // Paciente con Asignación activa y Habitación ocupada: gana "ya tiene Asignación".
    expectError(assignPatient(state, { roomId: 2, patientId: 10 }, NOW), 409, ROOM_MESSAGES.patientHasActiveAssignment);
  });

  it('devuelve 404 si la Habitación o el Paciente no existen', () => {
    expectError(assignPatient(baseState(), { roomId: 99, patientId: 12 }, NOW), 404, ROOM_MESSAGES.roomNotFound);
    expectError(assignPatient(baseState(), { roomId: 1, patientId: 99 }, NOW), 404, ROOM_MESSAGES.patientNotFound);
  });

  it('una Asignación cerrada no cuenta como activa', () => {
    const state = baseState();
    const closed: AssignmentLike = { ...active(2, 12), endedAt: new Date('2026-03-05T00:00:00Z'), releaseReason: 'alta' };
    const withHistory: OccupancyState = { ...state, assignments: [active(1, 10), closed] };
    const result = assignPatient(withHistory, { roomId: 2, patientId: 12 }, NOW);
    expect(result.ok).toBe(true);
  });
});

describe('releasePatient', () => {
  it.each([
    ['alta', 'dado de alta', 'alta'],
    ['fallecimiento', 'fallecido', 'fallecimiento'],
  ] as const)('libera por "%s": cierra la Asignación y el Paciente pasa a "%s"', (reason, status, movementType) => {
    const state = baseState();
    const copy = structuredClone(state);
    const result = releasePatient(state, { roomId: 2, patientId: 11, reason }, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.assignment).toEqual({ ...active(2, 11), endedAt: NOW, releaseReason: reason });
    expect(result.value.patientStatus).toBe(status);
    expect(result.value.movementType).toBe(movementType);
    expect(result.value.state.patients.find((p) => p.id === 11)?.status).toBe(status);
    // La Habitación 2 (capacidad 1) vuelve a estar disponible.
    expect(result.value.availability).toBe('disponible');
    // No queda ninguna Asignación activa del Paciente y la entrada no cambió.
    expect(result.value.state.assignments.filter((a) => a.patientId === 11 && a.endedAt === null)).toEqual([]);
    expect(state).toEqual(copy);
  });

  it('rechaza con 409 la liberación de un Paciente sin Asignación activa', () => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(releasePatient(state, { roomId: 1, patientId: 12, reason: 'alta' }, NOW), 409, ROOM_MESSAGES.noActiveAssignment);
    expect(state).toEqual(copy);
  });

  it('rechaza con 409 si la Asignación activa del Paciente está en otra Habitación', () => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(
      releasePatient(state, { roomId: 3, patientId: 10, reason: 'alta' }, NOW),
      409,
      ROOM_MESSAGES.activeAssignmentInOtherRoom,
    );
    expect(state).toEqual(copy);
  });

  it.each(['traslado', 'Alta', '', null, undefined, 1])('rechaza con 400 el motivo %j', (reason) => {
    const state = baseState();
    const copy = structuredClone(state);
    const result = releasePatient(state, { roomId: 1, patientId: 10, reason }, NOW);
    expectError(result, 400, ROOM_MESSAGES.invalidReason);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect((result.error as { errors?: unknown }).errors).toEqual([{ field: 'reason', message: ROOM_MESSAGES.invalidReason }]);
    }
    expect(state).toEqual(copy);
  });

  it('el motivo inválido se informa antes que la falta de Asignación activa', () => {
    expectError(releasePatient(baseState(), { roomId: 1, patientId: 12, reason: 'otro' }, NOW), 400, ROOM_MESSAGES.invalidReason);
  });

  it('devuelve 404 si la Habitación o el Paciente no existen', () => {
    expectError(releasePatient(baseState(), { roomId: 99, patientId: 10, reason: 'alta' }, NOW), 404, ROOM_MESSAGES.roomNotFound);
    expectError(releasePatient(baseState(), { roomId: 1, patientId: 99, reason: 'alta' }, NOW), 404, ROOM_MESSAGES.patientNotFound);
  });

  it('asignar y después liberar deja las mismas Asignaciones activas', () => {
    const state = baseState();
    const assigned = assignPatient(state, { roomId: 3, patientId: 12 }, NOW);
    if (!assigned.ok) throw new Error('asignación inesperadamente rechazada');
    const released = releasePatient(assigned.value.state, { roomId: 3, patientId: 12, reason: 'alta' }, NOW);
    if (!released.ok) throw new Error('liberación inesperadamente rechazada');
    expect(released.value.state.assignments.filter((a) => a.endedAt === null)).toEqual(state.assignments);
    expect(released.value.availability).toBe('disponible');
  });
});

describe('occupancyCounters', () => {
  it('cuenta ocupadas y disponibles en total y por Departamento', () => {
    const { rooms, assignments } = baseState();
    expect(occupancyCounters(rooms, assignments)).toEqual({
      total: { occupied: 1, available: 2, total: 3 },
      byDepartment: [
        { departmentId: 1, occupied: 1, available: 1, total: 2 },
        { departmentId: 2, occupied: 0, available: 1, total: 1 },
      ],
    });
  });

  it('sin Habitaciones devuelve ceros', () => {
    expect(occupancyCounters([], [])).toEqual({ total: { occupied: 0, available: 0, total: 0 }, byDepartment: [] });
  });
});

describe('occupancySummary', () => {
  const closed = (departmentId: number, startedAt: string, endedAt: string, releaseReason: 'alta' | 'fallecimiento'): AssignmentLike => ({
    roomId: 1,
    patientId: 1,
    departmentId,
    startedAt: new Date(startedAt),
    endedAt: new Date(endedAt),
    releaseReason,
  });
  const assignments: AssignmentLike[] = [
    closed(1, '2026-03-01T08:00:00Z', '2026-03-05T10:00:00Z', 'alta'),
    closed(1, '2026-03-02T08:00:00Z', '2026-03-10T00:00:00Z', 'fallecimiento'),
    closed(2, '2026-02-20T08:00:00Z', '2026-03-03T12:00:00Z', 'alta'),
    active(1, 2, 1, '2026-03-04T09:00:00Z'),
    active(2, 3, 2, '2026-01-15T09:00:00Z'), // activa con inicio fuera del rango
  ];

  it('cuenta iniciadas, activas y liberaciones por motivo dentro del rango', () => {
    const range = { from: new Date('2026-03-01T00:00:00Z'), to: new Date('2026-03-10T00:00:00Z') };
    expect(occupancySummary(assignments, range)).toEqual([
      { departmentId: 1, started: 3, active: 1, releasedByDischarge: 1, releasedByDeath: 1 },
      { departmentId: 2, started: 0, active: 1, releasedByDischarge: 1, releasedByDeath: 0 },
    ]);
  });

  it('incluye ambos extremos del rango y excluye un instante después del final', () => {
    const exact = { from: new Date('2026-03-01T08:00:00Z'), to: new Date('2026-03-10T00:00:00Z') };
    const summary = occupancySummary(assignments, exact);
    expect(summary[0]).toMatchObject({ started: 3, releasedByDeath: 1 });

    const justBefore = { from: new Date('2026-03-01T08:00:00.001Z'), to: new Date('2026-03-09T23:59:59.999Z') };
    expect(occupancySummary(assignments, justBefore)[0]).toMatchObject({ started: 2, releasedByDeath: 0, releasedByDischarge: 1 });
  });

  it('las activas se cuentan aunque su inicio quede fuera del rango', () => {
    const range = { from: new Date('2026-04-01T00:00:00Z'), to: new Date('2026-04-30T00:00:00Z') };
    expect(occupancySummary(assignments, range)).toEqual([
      { departmentId: 1, started: 0, active: 1, releasedByDischarge: 0, releasedByDeath: 0 },
      { departmentId: 2, started: 0, active: 1, releasedByDischarge: 0, releasedByDeath: 0 },
    ]);
  });

  it('respeta los extremos opcionales del rango', () => {
    expect(occupancySummary(assignments, {})).toEqual([
      { departmentId: 1, started: 3, active: 1, releasedByDischarge: 1, releasedByDeath: 1 },
      { departmentId: 2, started: 2, active: 1, releasedByDischarge: 1, releasedByDeath: 0 },
    ]);
    expect(occupancySummary(assignments, { from: new Date('2026-03-04T00:00:00Z') })[0]).toMatchObject({
      started: 1,
      releasedByDischarge: 1,
      releasedByDeath: 1,
    });
    expect(occupancySummary(assignments, { to: new Date('2026-03-04T00:00:00Z') })[1]).toMatchObject({
      started: 2,
      releasedByDischarge: 1,
    });
  });

  it('solo incluye Departamentos con Asignaciones y rechaza fechas inválidas', () => {
    expect(occupancySummary([], {})).toEqual([]);
    expect(() => occupancySummary(assignments, { from: new Date('no es fecha') })).toThrow(RangeError);
  });

  it('no modifica la entrada', () => {
    const copy = structuredClone(assignments);
    occupancySummary(assignments, { from: new Date('2026-03-01T00:00:00Z') });
    expect(assignments).toEqual(copy);
  });
});
