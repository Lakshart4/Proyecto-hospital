// Prueba de propiedades de transiciones del estado del Paciente (tarea 3.13, Property 12).
//
// El oráculo es la tabla de transiciones escrita a partir de la definición de Property 12 (Req. 20.4,
// 20.5): alta solo desde "activo", fallecimiento solo desde "activo", reingreso solo desde "dado de alta";
// cualquier otra combinación es CONFLICT y "fallecido" nunca cambia. Para la fecha de fallecimiento
// (Req. 20.3) se generan instantes alrededor del último ingreso y de `now`, incluidos los límites exactos
// y un milisegundo a cada lado.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { PatientStatus } from '../../src/domain/constants';
import { nextPatientStatus, validDeathTime, type PatientAction } from '../../src/domain/patients';

const RUNS = { numRuns: 100 };

const STATUSES: PatientStatus[] = ['activo', 'dado de alta', 'fallecido'];
const ACTIONS: PatientAction[] = ['alta', 'fallecimiento', 'reingreso'];

/** Tabla de la definición de Property 12; lo que no aparece es CONFLICT. */
const ALLOWED: Record<string, PatientStatus> = {
  'activo|alta': 'dado de alta',
  'activo|fallecimiento': 'fallecido',
  'dado de alta|reingreso': 'activo',
};
const expectedNext = (from: PatientStatus, action: PatientAction) => ALLOWED[`${from}|${action}`] ?? 'CONFLICT';

const BASE = Date.UTC(2026, 0, 1);
const DAY = 86_400_000;

/** Último ingreso y `now` (ingreso ≤ now), y un instante de fallecimiento cerca de los límites o al azar. */
const deathScenarioArb = fc
  .record({ admission: fc.integer({ min: 0, max: 60 * DAY }), gap: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 30 * DAY })) })
  .chain(({ admission, gap }) => {
    const lastAdmission = BASE + admission;
    const now = lastAdmission + gap;
    return fc.record({
      lastAdmission: fc.constant(lastAdmission),
      now: fc.constant(now),
      death: fc.oneof(
        fc.constantFrom(lastAdmission, lastAdmission - 1, lastAdmission + 1, now, now - 1, now + 1),
        fc.integer({ min: lastAdmission - 10 * DAY, max: now + 10 * DAY }),
      ),
    });
  });

const scenarioArb = fc.record({
  from: fc.constantFrom(...STATUSES),
  actions: fc.array(fc.constantFrom(...ACTIONS), { minLength: 1, maxLength: 12 }),
  death: deathScenarioArb,
});

describe('Estado del Paciente (propiedades)', () => {
  // Feature: hospital-management-system, Property 12: Transiciones del estado del Paciente
  it('Property 12: nextPatientStatus sigue la tabla de transiciones y validDeathTime acepta solo [último ingreso, now]', () => {
    fc.assert(
      fc.property(scenarioArb, ({ from, actions, death }) => {
        // Transición individual y secuencia: el estado solo cambia con una transición permitida.
        let status = from;
        let deceased = from === 'fallecido';
        for (const action of actions) {
          const result = nextPatientStatus(status, action);
          expect(result).toBe(expectedNext(status, action));
          if (status === 'fallecido') expect(result).toBe('CONFLICT');
          if (result !== 'CONFLICT') status = result;
          if (status === 'fallecido') deceased = true;
          // Una vez fallecido, el estado nunca vuelve a cambiar.
          if (deceased) expect(status).toBe('fallecido');
        }

        // Fecha de fallecimiento: válida si y solo si no es posterior a now ni anterior al último ingreso.
        const expectedValid = death.death <= death.now && death.death >= death.lastAdmission;
        expect(validDeathTime(new Date(death.death), new Date(death.lastAdmission), new Date(death.now))).toBe(expectedValid);
      }),
      RUNS,
    );
  });
});
