// Prueba de propiedades del menú por rol (tarea 5.8, Property 4: Matriz de permisos por rol, menú del frontend).
//
// La matriz de referencia es la función `can` del Backend (`backend/src/domain/permissions.ts`), importada
// solo para leerla. Para todo rol:
// - el menú contiene una sección si y solo si `can(rol, recurso, acción)` lo permite (con la única
//   excepción del diseño: `/perfil/documentos` es solo para Empleados);
// - la copia de la matriz del Frontend coincide con `can` en cada recurso con pantalla y acción de lectura;
// - toda ruta de una sección (exacta, con barra final, en mayúsculas, con consulta o con subrutas) se puede
//   abrir si y solo si su sección está en el menú, y una ruta que solo comparte el prefijo no pertenece a ella;
// - el Sidebar renderizado muestra exactamente esas entradas, sin ninguna de otros módulos.
// Además se revisan siempre como ejemplos fijos los menús esperados de cada rol según el mapa de rutas.

import { cleanup, render, screen, within } from '@testing-library/react';
import fc from 'fast-check';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { RESOURCES as BACKEND_RESOURCES, can as backendCan } from '../../../backend/src/domain/permissions';
import { Sidebar } from '../shared/components/Sidebar';
import { MESSAGES } from '../shared/lib/messages';
import { SECTIONS, canAccessPath, homeFor, menuFor, sectionForPath, type Section } from './navigation';
import { READ_ACTIONS, ROLES, SCREEN_RESOURCES, canRead, type Role } from './permissions';

const RUNS = { numRuns: 200 };

/** Oráculo: la sección se permite según `can` del Backend y la excepción del Apartado_Privado. */
const expectedAllowed = (role: Role, section: Section) =>
  backendCan(role, section.resource, section.action) && !(section.id === 'ownDocuments' && role === 'ADMIN');

/** Menús esperados según el mapa de rutas del diseño, escritos aparte del código. */
const EXPECTED_MENUS: Record<Role, string[]> = {
  ADMIN: ['dashboard', 'reports', 'staff', 'patients', 'appointments', 'inventory', 'rooms', 'ownProfile'],
  DOCTOR: ['patients', 'appointments', 'ownProfile', 'ownDocuments'],
  NURSE: ['patients', 'ownProfile', 'ownDocuments'],
  CLEANING: ['ownProfile', 'ownDocuments'],
};

/** Recursos que ningún rol distinto de ADMIN puede abrir (Property 4). */
const ADMIN_ONLY = ['dashboard', 'reports', 'inventory', 'rooms', 'staff'] as const;

const roleArb = fc.constantFrom(...ROLES);
const sectionArb = fc.constantFrom(...SECTIONS);
const segmentArb = fc.oneof(
  fc.constantFrom('nuevo', '1', '42', 'documentos', 'editar'),
  fc.stringMatching(/^[a-z0-9-]{1,8}$/),
);

/** Variantes de la ruta de una sección que React Router lleva a esa sección. */
const pathOfSectionArb = fc
  .tuple(sectionArb, fc.constantFrom('exacta', 'barra', 'mayúsculas', 'consulta', 'subruta'), segmentArb)
  .map(([section, variant, segment]) => {
    switch (variant) {
      case 'exacta':
        return { section, path: section.path };
      case 'barra':
        return { section, path: `${section.path}/` };
      case 'mayúsculas':
        return { section, path: section.path.toUpperCase() };
      case 'consulta':
        return { section, path: `${section.path}?page=2` };
      case 'subruta': {
        // Solo las secciones con subrutas las aceptan; para las demás es otra ruta, que puede ser
        // exactamente la de otra sección (`/perfil/documentos`) o ninguna.
        const path = `${section.path}/${segment}`;
        return { section: section.nested ? section : (SECTIONS.find((s) => s.path === path) ?? null), path };
      }
    }
  });

/** Rutas que solo comparten el prefijo de texto con una sección (por ejemplo, `/pacientesx`). */
const lookalikeArb = fc.tuple(sectionArb, fc.stringMatching(/^[a-z0-9-]{1,6}$/)).map(([section, suffix]) => `${section.path}${suffix}`);

const FIXED_PATHS = SECTIONS.flatMap((s) => [s.path, `${s.path}/`, s.path.toUpperCase(), `${s.path}/1`, `${s.path}-x`]);

function renderedMenu(role: Role, activePath: string): string[] {
  render(
    <MemoryRouter initialEntries={[activePath]}>
      <Sidebar role={role} open={false} onClose={() => undefined} />
    </MemoryRouter>,
  );
  const nav = screen.getByRole('navigation', { name: MESSAGES.nav.label, hidden: true });
  return within(nav)
    .getAllByRole('link', { hidden: true })
    .map((link) => link.textContent ?? '');
}

describe('Menú por rol (propiedades)', () => {
  it('ejemplos fijos: el menú de cada rol es el del mapa de rutas y su inicio está en el menú', () => {
    for (const role of ROLES) {
      expect(menuFor(role).map((s) => s.id)).toEqual(EXPECTED_MENUS[role]);
      expect(menuFor(role).map((s) => s.path)).toContain(homeFor(role));
    }
    expect(homeFor('ADMIN')).toBe('/dashboard');
    expect(homeFor('DOCTOR')).toBe('/pacientes');
    expect(homeFor('NURSE')).toBe('/pacientes');
    expect(homeFor('CLEANING')).toBe('/perfil');
    for (const role of ['DOCTOR', 'NURSE', 'CLEANING'] as const) {
      for (const id of ADMIN_ONLY) expect(menuFor(role).some((s) => s.id === id)).toBe(false);
    }
    expect(canAccessPath('DOCTOR', '/habitaciones')).toBe(false);
    expect(canAccessPath('CLEANING', '/pacientes/3')).toBe(false);
    expect(canAccessPath('ADMIN', '/perfil/documentos')).toBe(false);
    expect(canAccessPath('NURSE', '/perfil/documentos')).toBe(true);
    expect(sectionForPath('/pacientesx')).toBeUndefined();
    expect(sectionForPath('/perfil/documentos')?.id).toBe('ownDocuments');
  });

  // Feature: hospital-management-system, Property 4: Matriz de permisos por rol (menú del frontend)
  it('Property 4: el menú de cada rol contiene exactamente las secciones que la matriz le permite, y las rutas siguen el mismo criterio', () => {
    // La copia del Frontend usa los mismos nombres de recurso que el Backend.
    for (const resource of SCREEN_RESOURCES) expect(BACKEND_RESOURCES).toContain(resource);

    fc.assert(
      fc.property(
        roleArb,
        fc.constantFrom(...SCREEN_RESOURCES),
        fc.constantFrom(...READ_ACTIONS),
        pathOfSectionArb,
        lookalikeArb,
        (role, resource, action, generated, lookalike) => {
          // 1. Copia de la matriz igual a `can` del Backend.
          expect(canRead(role, resource, action)).toBe(backendCan(role, resource, action));

          // 2. Menú exacto: ni falta ni sobra ninguna sección, en el orden de SECTIONS.
          const menu = menuFor(role);
          expect(menu.map((s) => s.id)).toEqual(SECTIONS.filter((s) => expectedAllowed(role, s)).map((s) => s.id));
          for (const id of ADMIN_ONLY) expect(menu.some((s) => s.id === id)).toBe(role === 'ADMIN');

          // 3. Rutas: una ruta de sección se abre si y solo si la sección está en el menú.
          const owner = sectionForPath(generated.path);
          expect(owner?.id).toBe(generated.section?.id);
          if (generated.section) {
            expect(canAccessPath(role, generated.path)).toBe(menu.some((s) => s.id === generated.section?.id));
          }

          // 4. Compartir el prefijo de texto no da acceso a la sección.
          const lookalikeOwner = sectionForPath(lookalike);
          expect(lookalikeOwner === undefined || lookalike.startsWith(`${lookalikeOwner.path}/`) || lookalike === lookalikeOwner.path).toBe(true);
        },
      ),
      RUNS,
    );

    // Ejemplos fijos de la copia de la matriz: todos los roles, recursos y acciones.
    for (const role of ROLES) {
      for (const resource of SCREEN_RESOURCES) {
        for (const action of READ_ACTIONS) expect(canRead(role, resource, action)).toBe(backendCan(role, resource, action));
      }
    }

    for (const role of ROLES) {
      for (const path of FIXED_PATHS) {
        const section = sectionForPath(path);
        expect(canAccessPath(role, path)).toBe(section === undefined || expectedAllowed(role, section));
      }
    }
  });

  it('Property 4 (Sidebar): el menú renderizado muestra exactamente las entradas permitidas, con cualquier ruta activa', () => {
    fc.assert(
      fc.property(roleArb, fc.oneof(pathOfSectionArb.map((g) => g.path), fc.constantFrom('/', '/cambiar-contrasena')), (role, activePath) => {
        try {
          const labels = renderedMenu(role, activePath);
          expect(labels).toEqual(SECTIONS.filter((s) => expectedAllowed(role, s)).map((s) => s.label));
        } finally {
          cleanup();
        }
      }),
      { numRuns: 40, examples: ROLES.map((role): [Role, string] => [role, '/auditoria']) },
    );
  });
});
