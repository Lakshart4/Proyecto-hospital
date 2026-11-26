// Permisos por rol y reglas de alcance (Req. 2.3–2.7, 2.10, 5.7, 5.8, 6.6–6.10, 6.12, 7.10, 10.8, 10.10,
// 21.1–21.7, 23.5). Funciones puras: no acceden a la base de datos.
//
// `can` es la fuente única de la matriz del diseño ("Matriz de permisos (RBAC)"). Las reglas de alcance
// (propiedad y responsable) se aplican después con las demás funciones de este archivo. El alcance de
// los inventarios ya existe en `stock.ts` (`inventoryScope`) y se reexporta aquí sin duplicarlo.

import type { FieldError } from '../lib/errors';
import type { PatientStatus, Role, StoredEventType, TreatmentStatus } from './constants';

export { inventoryScope, type InventoryArea } from './stock';

export type Resource =
  | 'staff'
  | 'ownProfile'
  | 'employeeDocuments'
  | 'ownDocuments'
  | 'patients'
  | 'patientObservations'
  | 'patientTreatments'
  | 'patientMovements'
  | 'appointments'
  | 'inventory'
  | 'cleaningInventory'
  | 'suppliers'
  | 'deliveries'
  | 'inventoryMovements'
  | 'equipment'
  | 'maintenance'
  | 'rooms'
  | 'occupancy'
  | 'events'
  | 'nonWorkingDays'
  | 'shifts'
  | 'dashboard'
  | 'audit'
  | 'notifications'
  | 'reports'
  | 'settings'
  | 'holidays'
  | 'adminAuthorization';

export type Action = 'list' | 'read' | 'create' | 'update' | 'delete';

export const RESOURCES: readonly Resource[] = [
  'staff', 'ownProfile', 'employeeDocuments', 'ownDocuments', 'patients', 'patientObservations',
  'patientTreatments', 'patientMovements', 'appointments', 'inventory', 'cleaningInventory', 'suppliers', 'deliveries',
  'inventoryMovements', 'equipment', 'maintenance', 'rooms', 'occupancy', 'events', 'nonWorkingDays',
  'shifts', 'dashboard', 'audit', 'notifications', 'reports', 'settings', 'holidays', 'adminAuthorization',
];
export const ACTIONS: readonly Action[] = ['list', 'read', 'create', 'update', 'delete'];

// ---------- Matriz (Req. 2.3–2.7) ----------

type NonAdminRole = Exclude<Role, 'ADMIN'>;
type Grants = Partial<Record<Resource, readonly Action[]>>;

const READ: readonly Action[] = ['list', 'read'];
const ALL: readonly Action[] = ['list', 'read', 'create', 'update', 'delete'];

/** Permisos comunes a todos los Empleados: Perfil y documentos propios, agenda y calendarios. */
const EMPLOYEE_GRANTS: Grants = {
  ownProfile: ['read', 'update'],
  ownDocuments: READ,
  // Eventos: lectura de los generales, de actividad y de entrega; escritura solo de la agenda propia
  // (`canWriteEvent` y `canManageAgenda` lo restringen).
  events: ALL,
  nonWorkingDays: READ,
  shifts: READ,
  notifications: READ,
  holidays: READ,
};

/**
 * Recursos y acciones por rol distinto de ADMIN. El ADMIN accede a todo (los documentos de otros
 * Empleados exigen además Autorización_Administrativa, que comprueba otro middleware).
 */
const GRANTS: Readonly<Record<NonAdminRole, Grants>> = {
  DOCTOR: {
    ...EMPLOYEE_GRANTS,
    patients: READ,
    patientObservations: ['read', 'update'],
    patientTreatments: ['list', 'read', 'create', 'update'],
    patientMovements: READ,
    appointments: ['list', 'read', 'create', 'update'],
  },
  NURSE: {
    ...EMPLOYEE_GRANTS,
    patients: READ,
    patientObservations: ['read', 'update'],
    patientTreatments: ['list', 'read', 'update'],
    patientMovements: READ,
  },
  CLEANING: {
    ...EMPLOYEE_GRANTS,
    cleaningInventory: READ,
  },
};

/** Verdadero si el rol puede ejecutar la acción sobre el recurso según la matriz del diseño. */
export function can(role: Role, resource: Resource, action: Action): boolean {
  if (role === 'ADMIN') return true;
  return GRANTS[role][resource]?.includes(action) ?? false;
}

// ---------- Alcance de Pacientes (Req. 6.6, 6.7, 6.12, 20.6, 20.7) ----------

export interface Actor {
  id: number;
  role: Role;
}

export interface PatientScopeLike {
  doctorId: number;
  nurseId: number;
}

/** Acceso a un Paciente (y a su historial): ADMIN siempre; DOCTOR o NURSE si es el responsable; CLEANING nunca. */
export function canAccessPatient(actor: Actor, patient: PatientScopeLike): boolean {
  switch (actor.role) {
    case 'ADMIN':
      return true;
    case 'DOCTOR':
      return patient.doctorId === actor.id;
    case 'NURSE':
      return patient.nurseId === actor.id;
    case 'CLEANING':
      return false;
  }
}

/** Pacientes que el actor puede consultar, en el orden recibido; 'DENIED' para CLEANING (403 sin datos). */
export function patientScope<T extends PatientScopeLike>(actor: Actor, patients: readonly T[]): T[] | 'DENIED' {
  if (actor.role === 'CLEANING') return 'DENIED';
  return patients.filter((patient) => canAccessPatient(actor, patient));
}

// ---------- Rol del responsable (Req. 6.8–6.10) ----------

export const RESPONSIBLE_MESSAGES = {
  doctor: 'El médico responsable debe ser un empleado existente con rol Médico.',
  nurse: 'El enfermero responsable debe ser un empleado existente con rol Enfermero.',
} as const;

/**
 * Errores de la asignación de responsables (400). Solo se revisan los campos indicados: `doctorId` debe
 * ser un usuario existente con rol DOCTOR y `nurseId` uno con rol NURSE. Vacío si es válida; si no, el
 * servicio conserva la asignación previa.
 */
export function validateResponsibles(
  users: readonly Actor[],
  assignment: { doctorId?: number; nurseId?: number },
): FieldError[] {
  const roleOf = (id: number) => users.find((user) => user.id === id)?.role;
  const errors: FieldError[] = [];
  if (assignment.doctorId !== undefined && roleOf(assignment.doctorId) !== 'DOCTOR') {
    errors.push({ field: 'doctorId', message: RESPONSIBLE_MESSAGES.doctor });
  }
  if (assignment.nurseId !== undefined && roleOf(assignment.nurseId) !== 'NURSE') {
    errors.push({ field: 'nurseId', message: RESPONSIBLE_MESSAGES.nurse });
  }
  return errors;
}

// ---------- Actualización de Pacientes por Médicos y Enfermeros (Req. 21.1–21.7) ----------

export type PatientField =
  | 'medicalObservation'
  | 'nursingObservation'
  | 'treatment'
  | 'generalData'
  | 'department'
  | 'responsibles'
  | 'status'
  | 'admissionDate';

export type TreatmentTransition =
  | { action: 'create' | 'edit' | 'cancel' }
  | { action: 'markDone'; from: TreatmentStatus };

export type PatientUpdateDecision = 'ALLOW' | 'FORBIDDEN' | 'CONFLICT';

/** El rol tiene permiso sobre el campo (sin considerar responsable ni estado del Paciente). */
function hasFieldPermission(role: Role, field: PatientField, transition: TreatmentTransition | undefined): boolean {
  if (field === 'medicalObservation') return role === 'DOCTOR';
  if (field === 'nursingObservation') return role === 'NURSE';
  if (field !== 'treatment' || transition === undefined) return false;
  if (transition.action === 'markDone') return (role === 'DOCTOR' || role === 'NURSE') && transition.from === 'programado';
  return role === 'DOCTOR';
}

/**
 * Property 13. `ALLOW` si el actor es responsable, tiene permiso sobre el campo y el Paciente está
 * `activo`; `CONFLICT` (409) si es responsable con permiso pero el Paciente está `dado de alta` o
 * `fallecido`; `FORBIDDEN` (403) en cualquier otro caso. Regula a Médicos y Enfermeros: para ADMIN y
 * CLEANING devuelve `FORBIDDEN` (el ADMIN se autoriza con `can`).
 */
export function canUpdatePatientField(p: {
  role: Role;
  isResponsible: boolean;
  patientStatus: PatientStatus;
  field: PatientField;
  treatmentTransition?: TreatmentTransition;
}): PatientUpdateDecision {
  if (!p.isResponsible || !hasFieldPermission(p.role, p.field, p.treatmentTransition)) return 'FORBIDDEN';
  return p.patientStatus === 'activo' ? 'ALLOW' : 'CONFLICT';
}

// ---------- Perfil propio (Req. 5.7, 5.8) ----------

/** Claves que un Empleado puede enviar sobre su propio Perfil: foto, teléfono, contraseña y horario. */
export const OWN_PROFILE_EDITABLE_FIELDS = ['photoUrl', 'phone', 'password', 'schedule'] as const;

/**
 * Property 7: el cuerpo se acepta si y solo si es un objeto cuyas claves pertenecen todas a
 * `OWN_PROFILE_EDITABLE_FIELDS`. Cualquier otra clave (cargo, descripción, correo, ID interno,
 * Departamento, Rol, años de experiencia, Turno…) produce 403. Cada endpoint restringe además sus campos.
 */
export function canEditOwnProfile(body: unknown): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return false;
  const allowed: readonly string[] = OWN_PROFILE_EDITABLE_FIELDS;
  return Object.keys(body).every((key) => allowed.includes(key));
}

// ---------- Agenda individual (Req. 10.7, 10.8, 10.10) ----------

/** Property 35: crear, editar o eliminar Eventos personales solo en la propia agenda. */
export function canManageAgenda(actor: Actor, ownerId: number): boolean {
  return actor.id === ownerId;
}

/** Consultar una agenda individual: el propietario o un ADMIN. */
export function canReadAgenda(actor: Actor, ownerId: number): boolean {
  return actor.id === ownerId || actor.role === 'ADMIN';
}

/**
 * Escritura de un Evento guardado según la matriz: los de `agenda individual` solo en la propia agenda
 * (también para el ADMIN); los `general`, `actividad` y `entrega` solo el ADMIN.
 */
export function canWriteEvent(actor: Actor, event: { type: StoredEventType; ownerId: number | null }): boolean {
  if (event.type === 'agenda individual') return event.ownerId !== null && canManageAgenda(actor, event.ownerId);
  return actor.role === 'ADMIN';
}
