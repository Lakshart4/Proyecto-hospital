// Acceso a datos de Personal, Departamentos y Horario_de_Trabajo (Req. 5).
// Nunca selecciona `passwordHash` salvo en `listPendingPasswordHashes`, que solo lo usa el servicio para
// comprobar la unicidad de las contraseñas iniciales pendientes.

import type { Role, Shift } from '../domain/constants';
import type { ScheduleSlotRow, StaffDetailRow, StaffListRow } from '../domain/staff';
import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

const LIST_SELECT = {
  id: true,
  internalId: true,
  email: true,
  role: true,
  active: true,
  name: true,
  photoUrl: true,
  position: true,
  description: true,
  specialty: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  yearsExperience: true,
  shift: true,
  phone: true,
  birthDate: true,
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  scheduleSlots: {
    orderBy: { dayOfWeek: 'asc' },
    select: {
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      mealStart: true,
      mealEnd: true,
      breaks: { orderBy: { startTime: 'asc' }, select: { startTime: true, endTime: true } },
    },
  },
} as const;

/** Campos editables de un Empleado (la contraseña y el estado de la cuenta no se editan aquí). */
export interface StaffWriteData {
  internalId: string;
  email: string;
  role: Role;
  name: string;
  position: string;
  description: string;
  specialty: string;
  departmentId: number;
  yearsExperience: number;
  shift: Shift;
  phone: string;
  birthDate: Date | null;
}

export interface NewStaffData extends StaffWriteData {
  passwordHash: string;
}

// ---------- Empleados ----------

/** Todas las cuentas que no son ADMIN (los Administradores no son Empleados). */
export async function listEmployees(db: Client): Promise<StaffListRow[]> {
  return db.user.findMany({ where: { role: { not: 'ADMIN' } }, select: LIST_SELECT, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
}

export async function findStaffById(db: Client, id: number): Promise<StaffDetailRow | null> {
  return db.user.findUnique({ where: { id }, select: DETAIL_SELECT });
}

/** Crea la cuenta con `mustChangePassword = true` y sin foto (Req. 5.12). Duplicados: 409; Departamento inexistente: 400. */
export async function createStaff(tx: DbClient, data: NewStaffData): Promise<StaffDetailRow> {
  return runWithDbErrors({ operation: 'create', referenceField: 'departmentId' }, () =>
    tx.user.create({
      data: { ...data, mustChangePassword: true, active: true, photoUrl: null },
      select: DETAIL_SELECT,
    }),
  );
}

export async function updateStaff(tx: DbClient, id: number, data: StaffWriteData): Promise<StaffDetailRow> {
  return runWithDbErrors({ operation: 'update', referenceField: 'departmentId' }, () =>
    tx.user.update({ where: { id }, data, select: DETAIL_SELECT }),
  );
}

/** Elimina la cuenta. Sus Sesiones, horario y documentos caen por cascada; otras referencias dan 409. */
export async function deleteStaff(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.user.delete({ where: { id } }));
}

export async function setPhotoUrl(tx: DbClient, id: number, photoUrl: string | null): Promise<void> {
  await runWithDbErrors({ operation: 'update' }, () => tx.user.update({ where: { id }, data: { photoUrl } }));
}

export async function setPhone(tx: DbClient, id: number, phone: string): Promise<void> {
  await runWithDbErrors({ operation: 'update' }, () => tx.user.update({ where: { id }, data: { phone } }));
}

/** Pacientes `activo` cuyo médico o enfermero responsable es el Empleado (Req. 5.10). */
export async function countActivePatientsOf(db: Client, userId: number): Promise<number> {
  return db.patient.count({ where: { status: 'activo', OR: [{ doctorId: userId }, { nurseId: userId }] } });
}

/** Rutas relativas (dentro de storage/documents) de los documentos del Empleado. */
export async function listDocumentPaths(db: Client, userId: number): Promise<string[]> {
  const rows = await db.employeeDocument.findMany({ where: { userId }, select: { filePath: true } });
  return rows.map((row) => row.filePath);
}

/** Hashes de las cuentas que aún deben cambiar su contraseña (su contraseña inicial sigue vigente). */
export async function listPendingPasswordHashes(db: Client): Promise<string[]> {
  const rows = await db.user.findMany({ where: { mustChangePassword: true }, select: { passwordHash: true } });
  return rows.map((row) => row.passwordHash);
}

// ---------- Departamentos ----------

export async function listDepartments(db: Client): Promise<{ id: number; name: string }[]> {
  return db.department.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
}

export async function departmentExists(db: Client, id: number): Promise<boolean> {
  return (await db.department.count({ where: { id } })) > 0;
}

// ---------- Horario_de_Trabajo ----------

export interface ScheduleDayData {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mealStart: string | null;
  mealEnd: string | null;
  breaks: { startTime: string; endTime: string }[];
}

/** Reemplaza el horario semanal completo (los Descansos caen por cascada). Debe ejecutarse en una transacción. */
export async function replaceSchedule(tx: DbClient, userId: number, days: readonly ScheduleDayData[]): Promise<ScheduleSlotRow[]> {
  await tx.scheduleSlot.deleteMany({ where: { userId } });
  for (const day of days) {
    await tx.scheduleSlot.create({
      data: {
        userId,
        dayOfWeek: day.dayOfWeek,
        startTime: day.startTime,
        endTime: day.endTime,
        mealStart: day.mealStart,
        mealEnd: day.mealEnd,
        breaks: { create: day.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })) },
      },
    });
  }
  const slots = await tx.scheduleSlot.findMany({
    where: { userId },
    orderBy: { dayOfWeek: 'asc' },
    select: {
      dayOfWeek: true,
      startTime: true,
      endTime: true,
      mealStart: true,
      mealEnd: true,
      breaks: { orderBy: { startTime: 'asc' }, select: { startTime: true, endTime: true } },
    },
  });
  return slots;
}
