// Prueba de propiedades de disponibilidad e invariantes de ocupación (tarea 3.9, Property 18).
//
// Se generan Habitaciones con capacidad de 1 a 10 y secuencias de asignaciones y liberaciones que se
// aplican con el modelo puro de domain/rooms.ts. Un modelo propio de la prueba (qué Pacientes están
// activos en cada Habitación y el estado de cada Paciente, según los Req. 9.3 y 9.4) predice si cada
// operación debe aplicarse. Después de cada operación se comprueban los invariantes de Property 18
// contando las Asignaciones activas directamente (endedAt === null), sin usar activeCountOf.
// Los códigos y mensajes de los rechazos corresponden a Property 19 (tarea 3.10) y no se comprueban aquí.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PatientStatus } from '../../src/domain/constants';
import {
  assignPatient,
  releasePatient,
  roomAvailability,
  type AssignmentLike,
  type OccupancyState,
  type PatientLike,
  type RoomLike,
} from '../../src/domain/rooms';

const RUNS = { numRuns: 100 };

/** Motivos de liberación válidos y estado resultante del Paciente, escritos según los Req. 9.4 y 27.3. */
const VALID_REASONS = ['alta', 'fallecimiento'] as const;
type Reason = (typeof VALID_REASONS)[number];
const STATUS_AFTER: Record<Reason, PatientStatus> = { alta: 'dado de alta', fallecimiento: 'fallecido' };

const START = Date.UTC(2026, 2, 1, 8, 0, 0);
const MINUTE = 60_000;

// ---------- Generadores ----------

/** Capacidades de 1 a 10, con los límites 1 y 10 más probables. */
const capacityArb = fc.oneof(fc.constantFrom(1, 10), fc.integer({ min: 1, max: 10 }));

type Op =
  | { kind: 'assign'; room: number; patient: number }
  | { kind: 'release'; room: number; pick: number; reason: Reason }
  | { kind: 'fill'; room: number };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  { arbitrary: fc.record({ kind: fc.constant('assign' as const), room: fc.nat(), patient: fc.nat() }), weight: 5 },
  {
    arbitrary: fc.record({ kind: fc.constant('release' as const), room: fc.nat(), pick: fc.nat(), reason: fc.constantFrom(...VALID_REASONS) }),
    weight: 3,
  },
  { arbitrary: fc.record({ kind: fc.constant('fill' as const), room: fc.nat() }), weight: 1 },
);

const scenarioArb = fc.record({
  capacities: fc.array(capacityArb, { minLength: 1, maxLength: 3 }),
  ops: fc.array(opArb, { maxLength: 30 }),
  roundTripPicks: fc.array(fc.tuple(fc.nat(), fc.constantFrom(...VALID_REASONS)), { minLength: 31, maxLength: 31 }),
});

// ---------- Modelo propio de la prueba ----------

interface Shadow {
  /** Pacientes con Asignación activa en cada Habitación. */
  activeByRoom: Map<number, Set<number>>;
  status: Map<number, PatientStatus>;
}

const isEligible = (shadow: Shadow, patientId: number) =>
  shadow.status.get(patientId) === 'activo' && ![...shadow.activeByRoom.values()].some((set) => set.has(patientId));

/** Asignaciones activas contadas directamente en el estado. */
const activeIn = (state: OccupancyState, roomId: number) => state.assignments.filter((a) => a.roomId === roomId && a.endedAt === null);

/** Disponibilidad esperada según la definición de Property 18 y el Req. 9.9. */
const expectedAvailability = (count: number, capacity: number) => (count === capacity ? 'ocupada' : 'disponible');

const activeKeys = (assignments: readonly AssignmentLike[]) =>
  assignments
    .filter((a) => a.endedAt === null)
    .map((a) => `${a.roomId}|${a.patientId}|${a.startedAt.toISOString()}`)
    .sort();

/** Invariantes de Property 18 sobre un estado. */
function checkInvariants(state: OccupancyState, rooms: readonly RoomLike[], shadow: Shadow): void {
  for (const room of rooms) {
    const count = activeIn(state, room.id).length;
    expect(count).toBeGreaterThanOrEqual(0);
    expect(count).toBeLessThanOrEqual(room.capacity);
    expect(new Set(activeIn(state, room.id).map((a) => a.patientId))).toEqual(shadow.activeByRoom.get(room.id));
    expect(roomAvailability(count, room.capacity)).toBe(expectedAvailability(count, room.capacity));
  }
  for (const a of state.assignments) {
    if (a.endedAt === null) {
      expect(a.releaseReason).toBeNull();
    } else {
      expect(VALID_REASONS as readonly unknown[]).toContain(a.releaseReason);
    }
  }
  for (const patient of state.patients) expect(patient.status).toBe(shadow.status.get(patient.id));
}

/** Asignar un Paciente elegible y liberarlo restaura las Asignaciones activas y la disponibilidad previas. */
function checkRoundTrip(state: OccupancyState, rooms: readonly RoomLike[], shadow: Shadow, pick: number, reason: Reason, now: Date) {
  const patient = state.patients.find((p) => isEligible(shadow, p.id));
  const available = rooms.filter((r) => activeIn(state, r.id).length < r.capacity);
  if (!patient || available.length === 0) return false;
  const room = available[pick % available.length] as RoomLike;

  const assigned = assignPatient(state, { roomId: room.id, patientId: patient.id }, now);
  expect(assigned.ok).toBe(true);
  if (!assigned.ok) return false;
  const released = releasePatient(assigned.value.state, { roomId: room.id, patientId: patient.id, reason }, new Date(now.getTime() + MINUTE));
  expect(released.ok).toBe(true);
  if (!released.ok) return false;

  expect(activeKeys(released.value.state.assignments)).toEqual(activeKeys(state.assignments));
  for (const r of rooms) {
    const before = expectedAvailability(activeIn(state, r.id).length, r.capacity);
    expect(expectedAvailability(activeIn(released.value.state, r.id).length, r.capacity)).toBe(before);
  }
  expect(released.value.availability).toBe(expectedAvailability(activeIn(state, room.id).length, room.capacity));
  return true;
}

// ---------- Propiedad ----------

describe('Habitaciones (propiedades)', () => {
  // Feature: hospital-management-system, Property 18: Disponibilidad de Habitación e invariantes de ocupación
  it('Property 18: en toda secuencia de asignaciones y liberaciones se cumplen los invariantes de ocupación', () => {
    fc.assert(
      fc.property(scenarioArb, ({ capacities, ops, roundTripPicks }) => {
        const rooms: RoomLike[] = capacities.map((capacity, index) => ({ id: index + 1, departmentId: (index % 2) + 1, capacity }));
        const patients: PatientLike[] = [
          ...Array.from({ length: 30 }, (_, index): PatientLike => ({ id: 100 + index, status: 'activo' })),
          { id: 200, status: 'dado de alta' },
          { id: 201, status: 'fallecido' },
        ];
        let state: OccupancyState = { rooms, patients, assignments: [] };
        const shadow: Shadow = {
          activeByRoom: new Map(rooms.map((r) => [r.id, new Set<number>()])),
          status: new Map(patients.map((p) => [p.id, p.status])),
        };

        const tryAssign = (room: RoomLike, patientId: number, now: Date) => {
          const roomSet = shadow.activeByRoom.get(room.id) as Set<number>;
          const expectedOk = isEligible(shadow, patientId) && roomSet.size < room.capacity;
          const result = assignPatient(state, { roomId: room.id, patientId }, now);
          expect(result.ok).toBe(expectedOk);
          if (result.ok) {
            state = result.value.state;
            roomSet.add(patientId);
            expect(result.value.availability).toBe(expectedAvailability(roomSet.size, room.capacity));
          }
          return result.ok;
        };

        checkInvariants(state, rooms, shadow);
        ops.forEach((op, step) => {
          const now = new Date(START + step * 10 * MINUTE);
          const room = rooms[op.room % rooms.length] as RoomLike;
          const roomSet = shadow.activeByRoom.get(room.id) as Set<number>;

          if (op.kind === 'assign') {
            tryAssign(room, (patients[op.patient % patients.length] as PatientLike).id, now);
          } else if (op.kind === 'fill') {
            // Llena la Habitación hasta su capacidad y después intenta una asignación más.
            for (const p of patients) {
              if (roomSet.size >= room.capacity) break;
              if (isEligible(shadow, p.id)) tryAssign(room, p.id, now);
            }
            const extra = patients.find((p) => isEligible(shadow, p.id));
            if (extra) tryAssign(room, extra.id, now);
          } else {
            const actives = [...roomSet];
            const patientId = actives.length > 0 ? (actives[op.pick % actives.length] as number) : (patients[op.pick % patients.length] as PatientLike).id;
            const expectedOk = roomSet.has(patientId);
            const result = releasePatient(state, { roomId: room.id, patientId, reason: op.reason }, now);
            expect(result.ok).toBe(expectedOk);
            if (result.ok) {
              state = result.value.state;
              roomSet.delete(patientId);
              shadow.status.set(patientId, STATUS_AFTER[op.reason]);
              expect(result.value.assignment.releaseReason).toBe(op.reason);
              expect(result.value.assignment.endedAt).toEqual(now);
              expect(result.value.availability).toBe(expectedAvailability(roomSet.size, room.capacity));
            }
          }

          checkInvariants(state, rooms, shadow);
          const [pick, reason] = roundTripPicks[step] as [number, Reason];
          checkRoundTrip(state, rooms, shadow, pick, reason, new Date(now.getTime() + MINUTE));
        });
      }),
      RUNS,
    );
  });
});
