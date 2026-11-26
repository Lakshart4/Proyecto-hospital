// Prueba de propiedades de contadores y resumen de ocupación (tarea 3.11, Property 20).
//
// Se generan Habitaciones (Departamentos 1 a 3, capacidad 1 a 10), Asignaciones activas que respetan
// la capacidad, Asignaciones cerradas con motivo "alta" o "fallecimiento" y rangos con extremos
// opcionales (a veces iguales a un inicio o fin existente, para probar los límites inclusivos).
// El resultado esperado se calcula con un oráculo propio a partir de las definiciones del Req. 27.1,
// el Req. 27.5 y la decisión aprobada en la tarea 3.8: iniciadas con `startedAt` en el rango, activas
// sin aplicar el rango y liberaciones con `endedAt` en el rango, comparando instantes (from <= t <= to).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { occupancyCounters, occupancySummary, type AssignmentLike, type RoomLike } from '../../src/domain/rooms';

const RUNS = { numRuns: 100 };

const START = Date.UTC(2026, 0, 1);
const HOUR = 3_600_000;
/** Instantes en 30 días, con resolución de minutos. */
const instantArb = fc.integer({ min: 0, max: 30 * 24 * 60 }).map((minutes) => START + minutes * 60_000);

// ---------- Generadores ----------

const scenarioArb = fc
  .record({
    rooms: fc.array(
      fc.record({ departmentId: fc.integer({ min: 1, max: 3 }), capacity: fc.oneof(fc.constantFrom(1, 10), fc.integer({ min: 1, max: 10 })) }),
      { maxLength: 8 },
    ),
    actives: fc.array(fc.record({ room: fc.nat(), startedAt: instantArb }), { maxLength: 40 }),
    closed: fc.array(
      fc.record({
        room: fc.nat(),
        startedAt: instantArb,
        duration: fc.integer({ min: 0, max: 72 }),
        reason: fc.constantFrom('alta' as const, 'fallecimiento' as const),
      }),
      { maxLength: 25 },
    ),
  })
  .map(({ rooms: rawRooms, actives, closed }) => {
    const rooms: RoomLike[] = rawRooms.map((r, index) => ({ id: index + 1, ...r }));
    const assignments: AssignmentLike[] = [];
    if (rooms.length > 0) {
      const used = new Map<number, number>();
      actives.forEach((a, index) => {
        const room = rooms[a.room % rooms.length] as RoomLike;
        const count = used.get(room.id) ?? 0;
        if (count >= room.capacity) return; // activas ≤ capacidad
        used.set(room.id, count + 1);
        assignments.push({ roomId: room.id, patientId: 1000 + index, departmentId: room.departmentId, startedAt: new Date(a.startedAt), endedAt: null, releaseReason: null });
      });
      closed.forEach((c, index) => {
        const room = rooms[c.room % rooms.length] as RoomLike;
        assignments.push({
          roomId: room.id,
          patientId: 2000 + index,
          departmentId: room.departmentId,
          startedAt: new Date(c.startedAt),
          endedAt: new Date(c.startedAt + c.duration * HOUR),
          releaseReason: c.reason,
        });
      });
    }
    return { rooms, assignments };
  })
  .chain(({ rooms, assignments }) => {
    // Extremos del rango: ninguno, un instante aleatorio o un inicio/fin existente (límite exacto).
    const existing = assignments.flatMap((a) => [a.startedAt.getTime(), ...(a.endedAt ? [a.endedAt.getTime()] : [])]);
    const boundArb = fc.oneof(
      { arbitrary: fc.constant(undefined), weight: 2 },
      { arbitrary: instantArb, weight: 2 },
      ...(existing.length > 0 ? [{ arbitrary: fc.constantFrom(...existing), weight: 2 }] : []),
    );
    return fc.record({ from: boundArb, to: boundArb }).map(({ from, to }) => ({
      rooms,
      assignments,
      range: { ...(from !== undefined && { from: new Date(from) }), ...(to !== undefined && { to: new Date(to) }) } as { from?: Date; to?: Date },
    }));
  });

// ---------- Oráculo ----------

const inRange = (t: Date, range: { from?: Date; to?: Date }) =>
  (range.from === undefined || t.getTime() >= range.from.getTime()) && (range.to === undefined || t.getTime() <= range.to.getTime());

function expectedCounters(rooms: RoomLike[], assignments: AssignmentLike[]) {
  const isOccupied = (room: RoomLike) => assignments.filter((a) => a.roomId === room.id && a.endedAt === null).length === room.capacity;
  const count = (list: RoomLike[]) => ({
    occupied: list.filter(isOccupied).length,
    available: list.filter((r) => !isOccupied(r)).length,
    total: list.length,
  });
  const departments = [...new Set(rooms.map((r) => r.departmentId))].sort((a, b) => a - b);
  return {
    total: count(rooms),
    byDepartment: departments.map((departmentId) => ({ departmentId, ...count(rooms.filter((r) => r.departmentId === departmentId)) })),
  };
}

function expectedSummary(assignments: AssignmentLike[], range: { from?: Date; to?: Date }) {
  const departments = [...new Set(assignments.map((a) => a.departmentId))].sort((a, b) => a - b);
  return departments.map((departmentId) => {
    const own = assignments.filter((a) => a.departmentId === departmentId);
    const closedInRange = own.filter((a) => a.endedAt !== null && inRange(a.endedAt, range));
    return {
      departmentId,
      started: own.filter((a) => inRange(a.startedAt, range)).length,
      active: own.filter((a) => a.endedAt === null).length,
      releasedByDischarge: closedInRange.filter((a) => a.releaseReason === 'alta').length,
      releasedByDeath: closedInRange.filter((a) => a.releaseReason === 'fallecimiento').length,
    };
  });
}

// ---------- Propiedad ----------

describe('Contadores y resumen de ocupación (propiedades)', () => {
  // Feature: hospital-management-system, Property 20: Contadores y resumen de ocupación
  it('Property 20: ocupadas + disponibles = habitaciones y el resumen por Departamento es exacto', () => {
    fc.assert(
      fc.property(scenarioArb, ({ rooms, assignments, range }) => {
        const before = structuredClone({ rooms, assignments });

        // Contadores (Req. 27.1): total y por Departamento, con ocupadas + disponibles = habitaciones.
        const counters = occupancyCounters(rooms, assignments);
        expect(counters).toEqual(expectedCounters(rooms, assignments));
        expect(counters.total.occupied + counters.total.available).toBe(rooms.length);
        for (const d of counters.byDepartment) {
          expect(d.occupied + d.available).toBe(rooms.filter((r) => r.departmentId === d.departmentId).length);
        }

        // Resumen (Req. 27.5): iniciadas, activas y liberaciones por motivo, por Departamento.
        const summary = occupancySummary(assignments, range);
        expect(summary).toEqual(expectedSummary(assignments, range));
        for (const s of summary) {
          const closedInRange = assignments.filter((a) => a.departmentId === s.departmentId && a.endedAt !== null && inRange(a.endedAt, range));
          expect(s.releasedByDischarge + s.releasedByDeath).toBe(closedInRange.length);
        }

        // Funciones puras: la entrada no cambia.
        expect({ rooms, assignments }).toEqual(before);
      }),
      RUNS,
    );
  });
});
