// Prueba de propiedades de mantenimiento de equipos (tarea 3.20, Property 24).
//
// Se generan Equipos y secuencias de aperturas y cierres (válidos e inválidos) que se aplican con el
// modelo puro de domain/equipment.ts. Un modelo propio de la prueba, escrito a partir de Property 24,
// los Req. 26.1–26.3 y las decisiones aprobadas para la tarea 3.20, predice el resultado de cada
// operación y el estado de cada Equipo. Los errores no deben modificar el estado.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { OperationalStatus } from '../../src/domain/constants';
import { closeMaintenance, openMaintenance, type MaintenanceState } from '../../src/domain/equipment';

const RUNS = { numRuns: 100 };
const TODAY = new Date('2026-03-10T15:30:00Z');
const HOUR = 3_600_000;
const RESULTS = ['disponible', 'fuera de servicio'] as const;

type Op =
  | { kind: 'open'; equipment: number; startOffsetHours: number }
  | { kind: 'close'; pick: number; endDeltaMs: number; resultingStatus: string };

const opArb: fc.Arbitrary<Op> = fc.oneof(
  {
    arbitrary: fc.record({
      kind: fc.constant('open' as const),
      equipment: fc.nat(),
      // Horas antes de hoy; -1 genera una fecha de inicio posterior a hoy.
      startOffsetHours: fc.oneof(fc.constant(-1), fc.constant(0), fc.integer({ min: 0, max: 240 })),
    }),
    weight: 3,
  },
  {
    arbitrary: fc.record({
      kind: fc.constant('close' as const),
      pick: fc.nat(),
      // Fin respecto del inicio: 1 ms antes, igual o después.
      endDeltaMs: fc.oneof(fc.constantFrom(-1, 0, 1), fc.integer({ min: 0, max: 72 * HOUR })),
      resultingStatus: fc.oneof({ arbitrary: fc.constantFrom(...RESULTS), weight: 4 }, { arbitrary: fc.constantFrom('en uso', 'en mantenimiento', ''), weight: 1 }),
    }),
    weight: 3,
  },
);

const scenarioArb = fc.record({
  equipmentCount: fc.integer({ min: 1, max: 3 }),
  ops: fc.array(opArb, { minLength: 1, maxLength: 25 }),
});

describe('Mantenimiento de equipos (propiedades)', () => {
  // Feature: hospital-management-system, Property 24: Mantenimiento de equipos
  it('Property 24: como máximo un mantenimiento en curso por Equipo; abrir y cerrar dejan el estado indicado', () => {
    fc.assert(
      fc.property(scenarioArb, ({ equipmentCount, ops }) => {
        let state: MaintenanceState = {
          equipment: Array.from({ length: equipmentCount }, (_, i) => ({ id: i + 1, operationalStatus: 'disponible' as OperationalStatus })),
          records: [],
        };
        const status = new Map(state.equipment.map((e) => [e.id, e.operationalStatus as string]));
        const openByEquipment = new Map<number, number>(); // equipo → id del registro en curso
        const startOf = new Map<number, number>(); // registro → instante de inicio

        for (const op of ops) {
          const before = structuredClone(state);
          if (op.kind === 'open') {
            const equipmentId = (op.equipment % equipmentCount) + 1;
            const startDate = new Date(TODAY.getTime() - op.startOffsetHours * HOUR);
            const result = openMaintenance(state, { equipmentId, startDate }, TODAY);
            const expected = startDate.getTime() > TODAY.getTime() ? 400 : openByEquipment.has(equipmentId) ? 409 : 'ok';
            if (expected === 'ok') {
              expect(result.ok).toBe(true);
              if (!result.ok) continue;
              state = result.value.state;
              openByEquipment.set(equipmentId, result.value.record.id);
              startOf.set(result.value.record.id, startDate.getTime());
              status.set(equipmentId, 'en mantenimiento');
            } else {
              expect(result.ok).toBe(false);
              if (!result.ok) expect(result.error.status).toBe(expected);
              expect(state).toEqual(before);
            }
          } else {
            const ids = state.records.map((r) => r.id);
            const recordId = ids.length > 0 ? (ids[op.pick % ids.length] as number) : 1;
            const known = startOf.has(recordId);
            const isOpenRecord = [...openByEquipment.values()].includes(recordId);
            const endDate = new Date((startOf.get(recordId) ?? TODAY.getTime()) + op.endDeltaMs);
            const result = closeMaintenance(state, { recordId, endDate, resultingStatus: op.resultingStatus });
            const validStatus = (RESULTS as readonly string[]).includes(op.resultingStatus);
            const expected = !validStatus ? 400 : !known ? 404 : !isOpenRecord ? 409 : op.endDeltaMs < 0 ? 400 : 'ok';
            if (expected === 'ok') {
              expect(result.ok).toBe(true);
              if (!result.ok) continue;
              state = result.value.state;
              const equipmentId = [...openByEquipment].find(([, id]) => id === recordId)?.[0] as number;
              openByEquipment.delete(equipmentId);
              status.set(equipmentId, op.resultingStatus);
              expect(result.value.record.resultingStatus).toBe(op.resultingStatus);
              expect(result.value.record.endDate).toEqual(endDate);
            } else {
              expect(result.ok).toBe(false);
              if (!result.ok) expect(result.error.status).toBe(expected);
              expect(state).toEqual(before);
            }
          }

          // Invariantes: como máximo un registro en curso por Equipo y estados según el modelo.
          for (const e of state.equipment) {
            const open = state.records.filter((r) => r.equipmentId === e.id && r.endDate === null);
            expect(open.length).toBeLessThanOrEqual(1);
            expect(open.length === 1).toBe(openByEquipment.has(e.id));
            expect(e.operationalStatus).toBe(status.get(e.id));
          }
          for (const r of state.records) {
            if (r.endDate === null) expect(r.resultingStatus).toBeNull();
            else expect(r.endDate.getTime()).toBeGreaterThanOrEqual(r.startDate.getTime());
          }
        }
      }),
      RUNS,
    );
  });
});
