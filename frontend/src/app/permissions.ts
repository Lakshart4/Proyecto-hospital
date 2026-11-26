// Reflejo en el Frontend de la matriz de permisos del diseño ("Matriz de permisos (RBAC)").
//
// La fuente única es `backend/src/domain/permissions.ts` (`can`). El Frontend no puede importarla en
// tiempo de ejecución, así que aquí se copian solo los recursos que tienen pantalla y las acciones de
// lectura que deciden el menú y las rutas. La prueba de la Property 4 compara esta copia con la función
// `can` del Backend para cada rol, recurso y acción, de modo que cualquier diferencia hace fallar la suite.
// Las reglas de alcance (Pacientes propios, agenda propia) las aplica el Backend.

export const ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'CLEANING'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que cuentan como Empleado (el Administrador no es Empleado ni tiene documentos propios). */
export const EMPLOYEE_ROLES = ['DOCTOR', 'NURSE', 'CLEANING'] as const satisfies readonly Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Recursos del Backend que tienen una pantalla en el Frontend (mismos nombres que en `can`). */
export const SCREEN_RESOURCES = [
  'dashboard',
  'reports',
  'staff',
  'ownProfile',
  'ownDocuments',
  'patients',
  'appointments',
  'inventory',
  'cleaningInventory',
  'suppliers',
  'equipment',
  'rooms',
  'events',
  'audit',
  'notifications',
] as const;
export type ScreenResource = (typeof SCREEN_RESOURCES)[number];

/** Acciones de lectura: `list` para listados y `read` para recursos únicos como el Perfil propio. */
export type ReadAction = 'list' | 'read';
export const READ_ACTIONS: readonly ReadAction[] = ['list', 'read'];

type Grants = Partial<Record<ScreenResource, readonly ReadAction[]>>;
const READ: readonly ReadAction[] = ['list', 'read'];

/** Igual que `EMPLOYEE_GRANTS` del Backend, limitado a recursos con pantalla y acciones de lectura. */
const EMPLOYEE_GRANTS: Grants = {
  ownProfile: ['read'],
  ownDocuments: READ,
  events: READ,
  notifications: READ,
};

const GRANTS: Readonly<Record<Exclude<Role, 'ADMIN'>, Grants>> = {
  DOCTOR: { ...EMPLOYEE_GRANTS, patients: READ, appointments: READ },
  NURSE: { ...EMPLOYEE_GRANTS, patients: READ },
  CLEANING: { ...EMPLOYEE_GRANTS, cleaningInventory: READ },
};

/** Verdadero si el rol puede leer el recurso según la matriz. El ADMIN puede leer todo. */
export function canRead(role: Role, resource: ScreenResource, action: ReadAction): boolean {
  if (role === 'ADMIN') return true;
  return GRANTS[role][resource]?.includes(action) ?? false;
}
