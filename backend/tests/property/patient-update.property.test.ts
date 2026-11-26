// Prueba de propiedades de permisos de actualización de Médicos y Enfermeros (tarea 4.11, Property 13).
// En cada caso se elige un rol y un estado del Paciente y se revisan todas las combinaciones de
// responsable (sí/no), campo y transición de tratamiento. El oráculo escribe la regla del diseño.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PATIENT_STATUSES, ROLES, TREATMENT_STATUSES, type PatientStatus, type Role } from '../../src/domain/constants';
import { canUpdatePatientField, type PatientField, type TreatmentTransition } from '../../src/domain/permissions';

const RUNS = { numRuns: 100 };
const FIELDS: PatientField[] = ['medicalObservation', 'nursingObservation', 'treatment', 'generalData', 'department', 'responsibles', 'status', 'admissionDate'];
const TRANSITIONS: (TreatmentTransition | undefined)[] = [
  undefined,
  { action: 'create' },
  { action: 'edit' },
  { action: 'cancel' },
  ...TREATMENT_STATUSES.map((from): TreatmentTransition => ({ action: 'markDone', from })),
];

function oracle(role: Role, responsible: boolean, status: PatientStatus, field: PatientField, t: TreatmentTransition | undefined) {
  const doctorTreatment = role === 'DOCTOR' && field === 'treatment' && t !== undefined && t.action !== 'markDone';
  const markDone = (role === 'DOCTOR' || role === 'NURSE') && field === 'treatment' && t?.action === 'markDone' && t.from === 'programado';
  const permission =
    (role === 'DOCTOR' && field === 'medicalObservation') || (role === 'NURSE' && field === 'nursingObservation') || doctorTreatment || markDone;
  if (!responsible || !permission) return 'FORBIDDEN';
  return status === 'activo' ? 'ALLOW' : 'CONFLICT';
}

describe('Actualización de Pacientes por Médicos y Enfermeros (propiedades)', () => {
  // Feature: hospital-management-system, Property 13: Permisos de actualización de Médicos y Enfermeros
  it('Property 13: ALLOW solo al responsable con permiso sobre el campo y Paciente activo; CONFLICT si es responsable con permiso y el Paciente no está activo; FORBIDDEN en otro caso', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ROLES), fc.constantFrom(...PATIENT_STATUSES), (role, status) => {
        for (const responsible of [true, false]) {
          for (const field of FIELDS) {
            for (const transition of field === 'treatment' ? TRANSITIONS : [undefined]) {
              const input = { role, isResponsible: responsible, patientStatus: status, field, ...(transition ? { treatmentTransition: transition } : {}) };
              expect(canUpdatePatientField(input)).toBe(oracle(role, responsible, status, field, transition));
            }
          }
        }
      }),
      RUNS,
    );
  });
});
