// Prueba de propiedades de conflictos de asignación (tarea 3.10, Property 19).
//
// Se generan estados válidos de Habitaciones, Pacientes y Asignaciones (activas ≤ capacidad, como
// máximo una activa por Paciente, solo Pacientes "activo" con Asignación activa) y, sobre cada estado,
// una operación que debe rechazarse. El código esperado se deduce de la definición de Property 19 y de
// los Req. 9.5–9.8 y 9.13, sin usar el modelo probado: 409 para las asignaciones a una Habitación
// ocupada, de un Paciente con Asignación activa o de un Paciente no activo, y para la liberación de un
// Paciente sin Asignación activa (o con ella en otra Habitación, decisión aprobada en la tarea 3.8);
// 400 para un Motivo_de_Liberación inválido. En todos los casos el estado debe quedar exactamente igual.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PatientStatus } from '../../src/domain/constants';
import {
  assignPatient,
  releasePatient,
  type AssignmentLike,
  type OccupancyState,
  type PatientLike,
  type RoomLike,
} from '../../src/domain/rooms';

const RUNS = { numRuns: 100 };

const NOW = new Date('2026-03-10T15:30:00Z');
const VALID_REASONS = ['alta', 'fallecimiento'];
const STATUSES: PatientStatus[] = ['activo', 'dado de alta', 'fallecido'];

// ---------- Estado generado ----------

const capacityArb = fc.oneof(fc.constantFrom(1, 2, 10), fc.integer({ min: 1, max: 10 }));

const rawStateArb = fc.record({
  capacities: fc.array(capacityArb, { minLength: 1, maxLength: 3 }),
  patients: fc.array(
    fc.record({
      // "activo" más probable, para que haya Habitaciones llenas.
      status: fc.oneof({ arbitrary: fc.constant<PatientStatus>('activo'), weight: 3 }, { arbitrary: fc.constantFrom(...STATUSES), weight: 1 }),
      // Habitación deseada para una Asignación activa (o ninguna).
      room: fc.option(fc.nat(), { nil: undefined, freq: 4 }),
      closedReasons: fc.array(fc.constantFrom('alta' as const, 'fallecimiento' as const), { maxLength: 2 }),
    }),
    { minLength: 1, maxLength: 12 },
  ),
});

/** Construye un estado que cumple los invariantes de ocupación. */
interface RawState {
  capacities: number[];
  patients: { status: PatientStatus; room: number | undefined; closedReasons: ('alta' | 'fallecimiento')[] }[];
}

function buildState(raw: RawState): OccupancyState {
  const rooms: RoomLike[] = raw.capacities.map((capacity, index) => ({ id: index + 1, departmentId: (index % 2) + 1, capacity }));
  const patients: PatientLike[] = raw.patients.map((p, index) => ({ id: 100 + index, status: p.status }));
  const assignments: AssignmentLike[] = [];
  const used = new Map<number, number>(rooms.map((r) => [r.id, 0]));
  raw.patients.forEach((p, index) => {
    const patientId = 100 + index;
    p.closedReasons.forEach((reason, k) => {
      const room = rooms[(index + k) % rooms.length] as RoomLike;
      assignments.push({
        roomId: room.id,
        patientId,
        departmentId: room.departmentId,
        startedAt: new Date(Date.UTC(2026, 0, 1 + k)),
        endedAt: new Date(Date.UTC(2026, 0, 2 + k)),
        releaseReason: reason,
      });
    });
    if (p.status !== 'activo' || p.room === undefined) return;
    const room = rooms[p.room % rooms.length] as RoomLike;
    if ((used.get(room.id) as number) >= room.capacity) return;
    used.set(room.id, (used.get(room.id) as number) + 1);
    assignments.push({
      roomId: room.id,
      patientId,
      departmentId: room.departmentId,
      startedAt: new Date(Date.UTC(2026, 1, 1, index)),
      endedAt: null,
      releaseReason: null,
    });
  });
  return { rooms, patients, assignments };
}

// ---------- Operaciones que deben rechazarse ----------

type Conflict =
  | { kind: 'assign-occupied'; roomId: number; patientId: number }
  | { kind: 'assign-has-active'; roomId: number; patientId: number }
  | { kind: 'assign-not-active'; roomId: number; patientId: number }
  | { kind: 'release-no-active'; roomId: number; patientId: number; reason: string }
  | { kind: 'release-other-room'; roomId: number; patientId: number; reason: string }
  | { kind: 'release-invalid-reason'; roomId: number; patientId: number; reason: unknown };

/** Motivos inválidos: otros textos, variantes de mayúsculas o espacios de los válidos y valores que no son texto. */
const invalidReasonArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.constantFrom('Alta', 'ALTA', ' alta', 'alta ', 'Fallecimiento', 'traslado', 'defunción', '', '   '),
  fc.string({ maxLength: 12 }).filter((s) => !VALID_REASONS.includes(s)),
  fc.constantFrom(null, undefined, 0, 1, true, ['alta'], { reason: 'alta' }),
);

/** Operaciones aplicables al estado según las definiciones de la propiedad (oráculo propio de la prueba). */
function conflictsFor(state: OccupancyState): fc.Arbitrary<Conflict> {
  const activeOf = (patientId: number) => state.assignments.find((a) => a.patientId === patientId && a.endedAt === null);
  const activeCount = (roomId: number) => state.assignments.filter((a) => a.roomId === roomId && a.endedAt === null).length;
  const roomIds = state.rooms.map((r) => r.id);
  const patientIds = state.patients.map((p) => p.id);
  const occupied = state.rooms.filter((r) => activeCount(r.id) === r.capacity).map((r) => r.id);
  const withActive = patientIds.filter((id) => activeOf(id) !== undefined);
  const withoutActive = patientIds.filter((id) => activeOf(id) === undefined);
  const notActive = state.patients.filter((p) => p.status !== 'activo').map((p) => p.id);
  const reasonArb = fc.constantFrom(...VALID_REASONS);

  const options: fc.Arbitrary<Conflict>[] = [
    fc.record({ kind: fc.constant('release-invalid-reason' as const), roomId: fc.constantFrom(...roomIds), patientId: fc.constantFrom(...patientIds), reason: invalidReasonArb }),
  ];
  if (occupied.length > 0) {
    options.push(fc.record({ kind: fc.constant('assign-occupied' as const), roomId: fc.constantFrom(...occupied), patientId: fc.constantFrom(...patientIds) }));
  }
  if (withActive.length > 0) {
    options.push(fc.record({ kind: fc.constant('assign-has-active' as const), roomId: fc.constantFrom(...roomIds), patientId: fc.constantFrom(...withActive) }));
    const elsewhere = withActive.flatMap((patientId) =>
      roomIds.filter((roomId) => roomId !== activeOf(patientId)?.roomId).map((roomId) => ({ roomId, patientId })),
    );
    if (elsewhere.length > 0) {
      options.push(
        fc.tuple(fc.constantFrom(...elsewhere), reasonArb).map(([pair, reason]) => ({ kind: 'release-other-room' as const, ...pair, reason })),
      );
    }
  }
  if (notActive.length > 0) {
    options.push(fc.record({ kind: fc.constant('assign-not-active' as const), roomId: fc.constantFrom(...roomIds), patientId: fc.constantFrom(...notActive) }));
  }
  if (withoutActive.length > 0) {
    options.push(
      fc.record({ kind: fc.constant('release-no-active' as const), roomId: fc.constantFrom(...roomIds), patientId: fc.constantFrom(...withoutActive), reason: reasonArb }),
    );
  }
  return fc.oneof(...options);
}

const scenarioArb = rawStateArb.map(buildState).chain((state) => conflictsFor(state).map((conflict) => ({ state, conflict })));

// ---------- Propiedad ----------

describe('Conflictos de asignación (propiedades)', () => {
  // Feature: hospital-management-system, Property 19: Conflictos de asignación sin efectos
  it('Property 19: los conflictos devuelven 409, el motivo inválido 400, y el estado queda exactamente igual', () => {
    fc.assert(
      fc.property(scenarioArb, ({ state, conflict }) => {
        const before = structuredClone(state);
        const result = conflict.kind.startsWith('assign')
          ? assignPatient(state, { roomId: conflict.roomId, patientId: conflict.patientId }, NOW)
          : releasePatient(state, { roomId: conflict.roomId, patientId: conflict.patientId, reason: (conflict as { reason: unknown }).reason }, NOW);

        expect(result.ok).toBe(false);
        if (result.ok) return;
        if (conflict.kind === 'release-invalid-reason') {
          expect(result.error.status).toBe(400);
          expect(result.error.code).toBe('VALIDATION_ERROR');
          expect((result.error as { errors?: { field: string }[] }).errors?.map((e) => e.field)).toEqual(['reason']);
        } else {
          expect(result.error.status).toBe(409);
          expect(result.error.code).toBe('CONFLICT');
        }
        expect(typeof result.error.message).toBe('string');
        expect(result.error.message.length).toBeGreaterThan(0);
        // Sin efectos: el estado recibido no cambió en nada.
        expect(state).toEqual(before);
      }),
      RUNS,
    );
  });
});
