// Reglas puras de Personal (Req. 5.2, 5.3, 5.13).
//
// - `staffCriteria` arma los criterios de la lista de Empleados (rol, Departamento, Turno y búsqueda por
//   nombre o ID interno) para `applyFilters`, que los combina con AND sin distinguir mayúsculas.
// - `effectivePhotoUrl` devuelve la foto guardada o la imagen ilustrativa por defecto. La base de datos
//   conserva `null` cuando el Perfil no tiene foto.
// - `toStaffListItem` y `toStaffProfile` construyen los objetos que devuelve la API: nunca incluyen el hash
//   de la contraseña ni datos de sesión.

import { equals, search, type Criterion } from './filters';

/** Imagen ilustrativa por defecto (frontend/public/avatars/default.svg). */
export const DEFAULT_PHOTO_URL = '/avatars/default.svg';

/** Ruta pública (autenticada) de las fotos cargadas. */
export const PHOTO_URL_PREFIX = '/api/uploads/photos/';

/** Nombre de archivo de una foto: UUID en minúsculas y extensión jpg o png. Nada más es válido. */
const PHOTO_FILENAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png)$/;

export const isValidPhotoFilename = (value: unknown): value is string => typeof value === 'string' && PHOTO_FILENAME.test(value);

export const photoUrlFor = (filename: string): string => `${PHOTO_URL_PREFIX}${filename}`;

/** Nombre de archivo de una foto guardada en `photoUrl`, o null si no es una foto cargada válida. */
export function photoFilenameOf(photoUrl: string | null | undefined): string | null {
  if (typeof photoUrl !== 'string' || !photoUrl.startsWith(PHOTO_URL_PREFIX)) return null;
  const filename = photoUrl.slice(PHOTO_URL_PREFIX.length);
  return isValidPhotoFilename(filename) ? filename : null;
}

export const effectivePhotoUrl = (photoUrl: string | null | undefined): string => photoUrl ?? DEFAULT_PHOTO_URL;

// ---------- Filtros de la lista ----------

export interface StaffFilterRow {
  internalId: string;
  name: string;
  role: string;
  departmentId: number;
  shift: string;
}

export interface StaffFilters {
  role?: string | undefined;
  departmentId?: number | undefined;
  shift?: string | undefined;
  search?: string | undefined;
}

export function staffCriteria(filters: StaffFilters): Criterion<StaffFilterRow>[] {
  return [
    equals((row: StaffFilterRow) => row.role, filters.role),
    equals((row: StaffFilterRow) => row.departmentId, filters.departmentId),
    equals((row: StaffFilterRow) => row.shift, filters.shift),
    search((row: StaffFilterRow) => [row.name, row.internalId], filters.search),
  ];
}

// ---------- Objetos de la API ----------

export interface StaffListRow extends StaffFilterRow {
  id: number;
  email: string;
  active: boolean;
  photoUrl: string | null;
  position: string;
  description: string;
  specialty: string;
  department: { id: number; name: string };
  yearsExperience: number;
  phone: string;
  birthDate: Date | null;
}

export interface ScheduleSlotRow {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mealStart: string | null;
  mealEnd: string | null;
  breaks: { startTime: string; endTime: string }[];
}

export interface StaffDetailRow extends StaffListRow {
  scheduleSlots: ScheduleSlotRow[];
}

export interface WorkDay {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mealStart: string | null;
  mealEnd: string | null;
  breaks: { startTime: string; endTime: string }[];
}

const toDateOnly = (value: Date | null): string | null => (value === null ? null : value.toISOString().slice(0, 10));

export function toStaffListItem(row: StaffListRow) {
  return {
    id: row.id,
    internalId: row.internalId,
    email: row.email,
    role: row.role,
    active: row.active,
    name: row.name,
    photoUrl: effectivePhotoUrl(row.photoUrl),
    position: row.position,
    description: row.description,
    specialty: row.specialty,
    departmentId: row.departmentId,
    department: { id: row.department.id, name: row.department.name },
    yearsExperience: row.yearsExperience,
    shift: row.shift,
    phone: row.phone,
    birthDate: toDateOnly(row.birthDate),
  };
}

export function toWorkDays(slots: readonly ScheduleSlotRow[]): WorkDay[] {
  return [...slots]
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      mealStart: slot.mealStart,
      mealEnd: slot.mealEnd,
      breaks: slot.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
    }));
}

export function toStaffProfile(row: StaffDetailRow) {
  return { ...toStaffListItem(row), schedule: toWorkDays(row.scheduleSlots) };
}

export type StaffListItem = ReturnType<typeof toStaffListItem>;
export type StaffProfile = ReturnType<typeof toStaffProfile>;
