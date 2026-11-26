// Prueba de propiedades del rol requerido del responsable (tarea 4.9, Property 10).
// Usuarios con ids únicos de 1 a 8 y roles al azar; asignaciones con ids de 1 a 10 (algunos no existen)
// o ausentes. El oráculo busca el usuario y compara su rol.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROLES } from '../../src/domain/constants';
import { validateResponsibles } from '../../src/domain/permissions';

const RUNS = { numRuns: 100 };
const usersArb = fc.uniqueArray(fc.record({ id: fc.integer({ min: 1, max: 8 }), role: fc.constantFrom(...ROLES) }), { selector: (u) => u.id, maxLength: 8 });
const optionalIdArb = fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined });

describe('Rol del responsable (propiedades)', () => {
  // Feature: hospital-management-system, Property 10: Rol requerido del responsable
  it('Property 10: el médico se acepta si y solo si existe con rol DOCTOR y el enfermero si y solo si existe con rol NURSE; si no, error 400 por campo', () => {
    fc.assert(
      fc.property(usersArb, optionalIdArb, optionalIdArb, (users, doctorId, nurseId) => {
        const assignment = { ...(doctorId === undefined ? {} : { doctorId }), ...(nurseId === undefined ? {} : { nurseId }) };
        const errors = validateResponsibles(users, assignment);
        const doctorOk = doctorId === undefined || users.some((u) => u.id === doctorId && u.role === 'DOCTOR');
        const nurseOk = nurseId === undefined || users.some((u) => u.id === nurseId && u.role === 'NURSE');
        expect(errors.map((e) => e.field)).toEqual([...(doctorOk ? [] : ['doctorId']), ...(nurseOk ? [] : ['nurseId'])]);
        for (const error of errors) expect(error.message.length).toBeGreaterThan(0);
      }),
      RUNS,
    );
  });
});
