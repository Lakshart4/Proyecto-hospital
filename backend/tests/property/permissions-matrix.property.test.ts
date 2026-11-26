// Prueba de propiedades de la matriz de permisos (tarea 4.7, Property 4, parte del backend).
// La cláusula del menú del frontend se verifica en la Etapa 5.
//
// El oráculo es la tabla "Matriz de permisos (RBAC)" del diseño escrita aquí de otra forma: por recurso,
// las letras de acción (L listar, R leer, C crear, U actualizar, D eliminar) de DOCTOR, NURSE y CLEANING.
// ADMIN accede a todo. Las 96 combinaciones (rol, recurso) se ejecutan siempre como ejemplos fijos y en
// cada una se revisan las cinco acciones.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '../../src/domain/constants';
import { ACTIONS, RESOURCES, can, type Action, type Resource } from '../../src/domain/permissions';

const RUNS = { numRuns: 100 };
const LETTER: Record<Action, string> = { list: 'L', read: 'R', create: 'C', update: 'U', delete: 'D' };

//                       DOCTOR    NURSE    CLEANING
const MATRIX: Record<Resource, [string, string, string]> = {
  staff: ['', '', ''],
  ownProfile: ['RU', 'RU', 'RU'],
  employeeDocuments: ['', '', ''],
  ownDocuments: ['LR', 'LR', 'LR'],
  patients: ['LR', 'LR', ''],
  patientObservations: ['RU', 'RU', ''],
  patientTreatments: ['LRCU', 'LRU', ''],
  patientMovements: ['LR', 'LR', ''],
  appointments: ['LRCU', '', ''],
  inventory: ['', '', ''],
  cleaningInventory: ['', '', 'LR'],
  suppliers: ['', '', ''],
  deliveries: ['', '', ''],
  inventoryMovements: ['', '', ''],
  equipment: ['', '', ''],
  maintenance: ['', '', ''],
  rooms: ['', '', ''],
  occupancy: ['', '', ''],
  events: ['LRCUD', 'LRCUD', 'LRCUD'],
  nonWorkingDays: ['LR', 'LR', 'LR'],
  shifts: ['LR', 'LR', 'LR'],
  dashboard: ['', '', ''],
  audit: ['', '', ''],
  notifications: ['LR', 'LR', 'LR'],
  reports: ['', '', ''],
  settings: ['', '', ''],
  holidays: ['LR', 'LR', 'LR'],
  adminAuthorization: ['', '', ''],
};

function expected(role: Role, resource: Resource, action: Action): boolean {
  if (role === 'ADMIN') return true;
  const column = { DOCTOR: 0, NURSE: 1, CLEANING: 2 }[role];
  return MATRIX[resource][column]!.includes(LETTER[action]);
}

const ADMIN_ONLY: readonly Resource[] = ['dashboard', 'audit', 'equipment', 'maintenance', 'rooms', 'occupancy', 'suppliers', 'deliveries', 'inventoryMovements', 'inventory', 'reports', 'settings', 'adminAuthorization'];

const EXAMPLES: [Role, Resource][] = ROLES.flatMap((role) => RESOURCES.map((resource): [Role, Resource] => [role, resource]));

describe('Matriz de permisos (propiedades)', () => {
  // Feature: hospital-management-system, Property 4: Matriz de permisos por rol
  it('Property 4: can coincide con la matriz del diseño para toda tripleta (rol, recurso, acción)', () => {
    expect(RESOURCES).toHaveLength(Object.keys(MATRIX).length);
    fc.assert(
      fc.property(fc.constantFrom(...ROLES), fc.constantFrom(...RESOURCES), (role, resource) => {
        for (const action of ACTIONS) {
          const allowed = can(role, resource, action);
          expect(allowed).toBe(expected(role, resource, action));
          // Ningún rol distinto de ADMIN accede a los recursos administrativos.
          if (role !== 'ADMIN' && ADMIN_ONLY.includes(resource)) expect(allowed).toBe(false);
          // CLEANING nunca accede a Pacientes ni modifica el inventario de limpieza.
          if (role === 'CLEANING' && resource.startsWith('patient')) expect(allowed).toBe(false);
          if (role === 'CLEANING' && resource === 'cleaningInventory' && action !== 'list' && action !== 'read') expect(allowed).toBe(false);
        }
      }),
      { ...RUNS, examples: EXAMPLES },
    );
  });
});
