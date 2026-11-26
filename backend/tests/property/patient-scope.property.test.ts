// Prueba de propiedades del alcance de Pacientes por responsable (tarea 4.8, Property 9).
// Pacientes con médico y enfermero de un grupo pequeño de ids (para que haya coincidencias) y actores de
// los cuatro roles con ids del mismo grupo. El oráculo filtra directamente por doctorId o nurseId.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../../src/domain/constants';
import { canAccessPatient, patientScope } from '../../src/domain/permissions';

const RUNS = { numRuns: 100 };
const idArb = fc.integer({ min: 1, max: 5 });
const patientsArb = fc.array(fc.record({ id: fc.nat(), doctorId: idArb, nurseId: idArb }), { maxLength: 20 });
const actorArb = fc.record({ id: idArb, role: fc.constantFrom(...ROLES) });

describe('Alcance de Pacientes (propiedades)', () => {
  // Feature: hospital-management-system, Property 9: Alcance de Pacientes por responsable
  it('Property 9: DOCTOR ve exactamente los de su doctorId, NURSE los de su nurseId, ADMIN todos y CLEANING se deniega; el acceso individual coincide con el alcance', () => {
    fc.assert(
      fc.property(actorArb, patientsArb, (actor, patients) => {
        const copy = structuredClone(patients);
        const result = patientScope(actor, patients);
        const expected =
          actor.role === 'ADMIN' ? patients
          : actor.role === 'DOCTOR' ? patients.filter((p) => p.doctorId === actor.id)
          : actor.role === 'NURSE' ? patients.filter((p) => p.nurseId === actor.id)
          : 'DENIED';
        expect(result).toEqual(expected);
        for (const patient of patients) {
          const inScope = result !== 'DENIED' && result.includes(patient);
          expect(canAccessPatient(actor, patient)).toBe(inScope);
        }
        expect(patients).toEqual(copy);
      }),
      RUNS,
    );
  });
});
