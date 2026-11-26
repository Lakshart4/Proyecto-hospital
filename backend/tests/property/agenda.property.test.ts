// Prueba de propiedades de la propiedad de la agenda individual (tarea 4.13, Property 35).
// Actores de los cuatro roles con ids de 1 a 4, propietarios de 1 a 4 y Eventos de los cuatro tipos
// guardados. El oráculo compara ids y rol directamente.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROLES, STORED_EVENT_TYPES } from '../../src/domain/constants';
import { canManageAgenda, canReadAgenda, canWriteEvent } from '../../src/domain/permissions';

const RUNS = { numRuns: 100 };
const idArb = fc.integer({ min: 1, max: 4 });

describe('Agenda individual (propiedades)', () => {
  // Feature: hospital-management-system, Property 35: Propiedad de la agenda individual
  it('Property 35: crear, editar o eliminar Eventos personales solo si el actor es el propietario; consultar si es el propietario o ADMIN', () => {
    fc.assert(
      fc.property(fc.record({ id: idArb, role: fc.constantFrom(...ROLES) }), idArb, fc.constantFrom(...STORED_EVENT_TYPES), (actor, ownerId, type) => {
        const owner = actor.id === ownerId;
        expect(canManageAgenda(actor, ownerId)).toBe(owner);
        expect(canReadAgenda(actor, ownerId)).toBe(owner || actor.role === 'ADMIN');
        const write = canWriteEvent(actor, { type, ownerId: type === 'agenda individual' ? ownerId : null });
        expect(write).toBe(type === 'agenda individual' ? owner : actor.role === 'ADMIN');
      }),
      RUNS,
    );
  });
});
