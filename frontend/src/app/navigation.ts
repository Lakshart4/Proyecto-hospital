// Secciones del Frontend, menú lateral por rol y página de inicio de cada rol (Req. 2.8, 2.9, 15.3, 15.6).
//
// Cada sección declara el recurso y la acción de lectura de la matriz que la habilita; los roles se
// derivan de `canRead` y no se escriben a mano. Única excepción, tomada del mapa de rutas del diseño:
// `/perfil/documentos` (Apartado_Privado) es solo para Empleados, porque el Administrador no es Empleado
// y no tiene documentos propios.

import {
  BarChart3,
  BedDouble,
  Bell,
  CalendarCheck,
  FileText,
  HeartPulse,
  LayoutDashboard,
  Pill,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { MESSAGES } from '../shared/lib/messages';
import { ROLES, canRead, type ReadAction, type Role, type ScreenResource } from './permissions';

export interface Section {
  id: ScreenResource;
  path: string;
  label: string;
  icon: LucideIcon;
  resource: ScreenResource;
  /** `list` para listados; `read` para el Perfil propio, que es un único recurso. */
  action: ReadAction;
  /** Solo Empleados (excluye al Administrador). */
  employeesOnly?: boolean;
  /** La sección tiene subrutas (`/personal/nuevo`, `/pacientes/:id`…). */
  nested?: boolean;
}

/** En el orden del menú. */
export const SECTIONS: readonly Section[] = [
  { id: 'dashboard', path: '/dashboard', label: MESSAGES.nav.dashboard, icon: LayoutDashboard, resource: 'dashboard', action: 'list' },
  { id: 'notifications', path: '/alertas', label: MESSAGES.nav.notifications, icon: Bell, resource: 'notifications', action: 'list' },
  { id: 'reports', path: '/reportes', label: MESSAGES.nav.reports, icon: BarChart3, resource: 'reports', action: 'list' },
  { id: 'staff', path: '/personal', label: MESSAGES.nav.staff, icon: Users, resource: 'staff', action: 'list', nested: true },
  { id: 'patients', path: '/pacientes', label: MESSAGES.nav.patients, icon: HeartPulse, resource: 'patients', action: 'list', nested: true },
  { id: 'appointments', path: '/citas', label: MESSAGES.nav.appointments, icon: CalendarCheck, resource: 'appointments', action: 'list' },
  { id: 'inventory', path: '/inventario', label: MESSAGES.nav.inventory, icon: Pill, resource: 'inventory', action: 'list', nested: true },
  { id: 'rooms', path: '/habitaciones', label: MESSAGES.nav.rooms, icon: BedDouble, resource: 'rooms', action: 'list' },
  { id: 'ownProfile', path: '/perfil', label: MESSAGES.nav.profile, icon: UserRound, resource: 'ownProfile', action: 'read' },
  { id: 'ownDocuments', path: '/perfil/documentos', label: MESSAGES.nav.ownDocuments, icon: FileText, resource: 'ownDocuments', action: 'list', employeesOnly: true },
];

export const CHANGE_PASSWORD_PATH = '/cambiar-contrasena';
export const LOGIN_PATH = '/login';
export const FORGOT_PASSWORD_PATH = '/recuperar-contrasena';
export const RESET_PASSWORD_PATH = '/restablecer';

/** Rutas que no requieren Sesión. */
export const PUBLIC_PATHS: readonly string[] = [LOGIN_PATH, FORGOT_PASSWORD_PATH, RESET_PASSWORD_PATH];

/** El rol puede abrir la sección. */
export function canOpenSection(role: Role, section: Section): boolean {
  if (section.employeesOnly && role === 'ADMIN') return false;
  return canRead(role, section.resource, section.action);
}

export function rolesForSection(section: Section): Role[] {
  return ROLES.filter((role) => canOpenSection(role, section));
}

/** Entradas del menú lateral del rol, en el orden de `SECTIONS`. */
export function menuFor(role: Role): Section[] {
  return SECTIONS.filter((section) => canOpenSection(role, section));
}

const HOME_SECTION: Readonly<Record<Role, ScreenResource>> = {
  ADMIN: 'dashboard',
  DOCTOR: 'patients',
  NURSE: 'patients',
  CLEANING: 'ownProfile',
};

/** Página de inicio del rol en la versión reducida y estable. */
export function homeFor(role: Role): string {
  const section = SECTIONS.find((s) => s.id === HOME_SECTION[role]);
  return section ? section.path : CHANGE_PASSWORD_PATH;
}

/** Ruta sin consulta, fragmento ni barras finales, en minúsculas (React Router no distingue mayúsculas). */
export function normalizePath(pathname: string): string {
  const path = pathname.split(/[?#]/)[0] ?? '';
  const trimmed = path.replace(/\/+$/, '');
  return (trimmed === '' ? '/' : trimmed).toLowerCase();
}

/** Sección a la que pertenece una ruta (la más específica), o `undefined` si no pertenece a ninguna. */
export function sectionForPath(pathname: string): Section | undefined {
  const path = normalizePath(pathname);
  let best: Section | undefined;
  for (const section of SECTIONS) {
    const matches = path === section.path || (section.nested === true && path.startsWith(`${section.path}/`));
    if (matches && (best === undefined || section.path.length > best.path.length)) best = section;
  }
  return best;
}

/** Estado de navegación que guardan las redirecciones a `/login` y de `RoleGuard`. */
export interface RedirectState {
  from?: string;
  accessDenied?: boolean;
}

export function readRedirectState(state: unknown): RedirectState {
  if (typeof state !== 'object' || state === null) return {};
  const { from, accessDenied } = state as Record<string, unknown>;
  return {
    ...(typeof from === 'string' ? { from } : {}),
    ...(accessDenied === true ? { accessDenied: true } : {}),
  };
}

/**
 * A dónde ir tras iniciar sesión: al cambio de contraseña si es obligatorio; si no, a la ruta que se quiso
 * abrir antes de iniciar sesión cuando es interna, no pública y permitida para el rol; si no, al inicio del rol.
 */
export function destinationAfterLogin(user: { role: Role; mustChangePassword: boolean }, state: unknown): string {
  if (user.mustChangePassword) return CHANGE_PASSWORD_PATH;
  const { from } = readRedirectState(state);
  const internal = from !== undefined && from.startsWith('/') && !from.startsWith('//');
  if (internal && from !== '/' && !PUBLIC_PATHS.includes(normalizePath(from)) && canAccessPath(user.role, from)) return from;
  return homeFor(user.role);
}

/**
 * El rol puede abrir la ruta. Las rutas que no pertenecen a ninguna sección (inicio, cambio de
 * contraseña, página no encontrada) se permiten a cualquier Usuario autenticado.
 */
export function canAccessPath(role: Role, pathname: string): boolean {
  const section = sectionForPath(pathname);
  return section === undefined || canOpenSection(role, section);
}
