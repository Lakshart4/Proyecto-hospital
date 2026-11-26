// Servicio de Personal, Departamentos, Horario_de_Trabajo y fotos de Perfil (Req. 5, 12, 13).
//
// Reglas de alcance (después de authenticate, requirePasswordChange y authorize):
// - Un ADMIN gestiona a los Empleados; un Empleado solo accede a su propio Perfil (403 sin consultar datos).
// - Las cuentas ADMIN no son Empleados: no aparecen en la lista, no se editan ni se eliminan desde aquí (409).
// Cada operación que cambia datos y su registro de Bitácora_de_Auditoría van en la misma transacción; si la
// auditoría falla, la operación se revierte. Los archivos se tocan solo después de confirmar la base de datos:
// una eliminación revertida nunca deja al Empleado sin sus archivos. Los registros de auditoría solo llevan
// nombres de campos (nunca valores, contraseñas, hashes ni tokens).

import type { Role } from '../domain/constants';
import { applyFilters } from '../domain/filters';
import { validateUpload } from '../domain/files';
import { validateDaySchedule } from '../domain/schedule';
import {
  effectivePhotoUrl,
  photoFilenameOf,
  photoUrlFor,
  staffCriteria,
  toStaffListItem,
  toStaffProfile,
  toWorkDays,
  type StaffDetailRow,
  type StaffFilters,
  type StaffListRow,
} from '../domain/staff';
import { ConflictError, ForbiddenError, InternalError, NotFoundError, ValidationError, type FieldError } from '../lib/errors';
import type { DocumentFiles } from '../lib/document-files';
import { generateInitialPassword } from '../lib/initial-password';
import { BCRYPT_COST, hashPassword, verifyPassword } from '../lib/password';
import { detectFileType, SIGNATURE_BYTES } from '../lib/file-signature';
import type { PhotoStorage } from '../lib/photo-storage';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  countActivePatientsOf,
  createStaff,
  deleteStaff,
  departmentExists,
  findStaffById,
  listDepartments,
  listDocumentPaths,
  listEmployees,
  listPendingPasswordHashes,
  replaceSchedule,
  setPhone,
  setPhotoUrl,
  updateStaff,
  type ScheduleDayData,
  type StaffWriteData,
} from '../repositories/staff.repository';
import { withTransaction, type DbClient } from '../repositories/transaction';
import type { PatchMeBody, ScheduleBody, StaffBody } from '../schemas/staff';

export const STAFF_MESSAGES = {
  adminAccount: 'Las cuentas de Administrador no se gestionan desde Personal.',
  selfDelete: 'No puedes eliminar tu propia cuenta.',
  activePatients: 'No se puede eliminar al Empleado porque tiene Pacientes activos asignados.',
  department: 'El Departamento indicado no existe.',
  photoUrl: 'La foto solo puede quitarse (null). Para cambiarla, sube un archivo.',
  noPhoto: 'Debes adjuntar una foto en el campo "file".',
  invalidSchedule: 'El horario no es válido.',
  invalidPhoto: 'La foto no es válida.',
  duplicateDay: 'Ya hay un horario para ese día de la semana.',
} as const;

/** Intentos máximos para obtener una contraseña inicial distinta de las pendientes. */
export const MAX_PASSWORD_ATTEMPTS = 5;

export interface Actor {
  id: number;
  role: Role;
}

export interface UploadedPhoto {
  buffer: Uint8Array;
  size: number;
  mimetype: string;
}

export interface StaffServiceOptions {
  db: Database;
  bcryptCost?: number;
  photos: PhotoStorage;
  documents: DocumentFiles;
  /** Generador de contraseñas iniciales (las pruebas inyectan uno para forzar colisiones). */
  generatePassword?: () => string;
}

const isAdmin = (actor: Actor) => actor.role === 'ADMIN';

/** Nombres de los campos del Perfil cuyo valor cambió (nunca los valores). */
function changedFields(before: StaffDetailRow, after: StaffWriteData): string[] {
  const birth = (d: Date | null) => (d === null ? null : d.toISOString().slice(0, 10));
  const pairs: [string, unknown, unknown][] = [
    ['internalId', before.internalId, after.internalId],
    ['email', before.email, after.email],
    ['role', before.role, after.role],
    ['name', before.name, after.name],
    ['position', before.position, after.position],
    ['description', before.description, after.description],
    ['specialty', before.specialty, after.specialty],
    ['departmentId', before.departmentId, after.departmentId],
    ['yearsExperience', before.yearsExperience, after.yearsExperience],
    ['shift', before.shift, after.shift],
    ['phone', before.phone, after.phone],
    ['birthDate', birth(before.birthDate), birth(after.birthDate)],
  ];
  return pairs.filter(([, a, b]) => a !== b).map(([name]) => name);
}

export function createStaffService(options: StaffServiceOptions) {
  const { db, photos, documents } = options;
  const cost = options.bcryptCost ?? BCRYPT_COST;
  const generatePassword = options.generatePassword ?? generateInitialPassword;

  const audit = (tx: DbClient, actor: Actor, action: 'EMPLOYEE_CREATE' | 'EMPLOYEE_UPDATE' | 'EMPLOYEE_DELETE' | 'ROLE_CHANGE' | 'PROFILE_DETAIL_READ', entityId: number, details: Record<string, unknown> = {}) =>
    writeAudit(tx, { userId: actor.id, action, entityType: 'Employee', entityId, details });

  const requireSelfOrAdmin = (actor: Actor, id: number) => {
    if (!isAdmin(actor) && actor.id !== id) throw new ForbiddenError();
  };

  const requireTarget = async (id: number): Promise<StaffDetailRow> => {
    const target = await findStaffById(db, id);
    if (target === null) throw new NotFoundError('El Empleado no existe.');
    return target;
  };

  /** Una cuenta ADMIN solo se modifica desde su propia sesión (horario y foto propios). */
  const requireManageable = (actor: Actor, target: StaffDetailRow) => {
    if (target.role === 'ADMIN' && target.id !== actor.id) throw new ConflictError(STAFF_MESSAGES.adminAccount);
  };

  const requireDepartment = async (departmentId: number) => {
    if (!(await departmentExists(db, departmentId))) {
      throw new ValidationError('Los datos enviados no son válidos.', [{ field: 'departmentId', message: STAFF_MESSAGES.department }]);
    }
  };

  /** Contraseña inicial distinta de las que siguen pendientes de cambio (comparación segura contra sus hashes). */
  const newInitialPassword = async (): Promise<string> => {
    const pending = await listPendingPasswordHashes(db);
    for (let attempt = 0; attempt < MAX_PASSWORD_ATTEMPTS; attempt++) {
      const candidate = generatePassword();
      const matches = await Promise.all(pending.map((hash) => verifyPassword(candidate, hash)));
      if (!matches.some(Boolean)) return candidate;
    }
    throw new InternalError();
  };

  const toWriteData = (body: StaffBody): StaffWriteData => ({
    internalId: body.internalId,
    email: body.email,
    role: body.role,
    name: body.name,
    position: body.position,
    description: body.description ?? '',
    specialty: body.specialty,
    departmentId: body.departmentId,
    yearsExperience: body.yearsExperience,
    shift: body.shift,
    phone: body.phone,
    birthDate: body.birthDate ?? null,
  });

  return {
    /** Empleados (rol distinto de ADMIN) que cumplen todos los filtros indicados (Req. 5.3). */
    async list(filters: StaffFilters) {
      const rows = await listEmployees(db);
      return applyFilters<StaffListRow>(rows, staffCriteria(filters)).map(toStaffListItem);
    },

    /** Perfil propio, o el de cualquier Empleado si el actor es ADMIN (la consulta de otro Perfil se audita, Req. 5.17). */
    async get(actor: Actor, id: number) {
      requireSelfOrAdmin(actor, id);
      const target = await requireTarget(id);
      if (target.role === 'ADMIN' && target.id !== actor.id) throw new NotFoundError('El Empleado no existe.');
      if (isAdmin(actor) && actor.id !== id) {
        await withTransaction((tx) => audit(tx, actor, 'PROFILE_DETAIL_READ', id), { client: db });
      }
      return toStaffProfile(target);
    },

    /** Crea el Empleado con una contraseña inicial que solo se devuelve aquí (Req. 5.12). */
    async create(actor: Actor, body: StaffBody) {
      await requireDepartment(body.departmentId);
      const initialPassword = await newInitialPassword();
      const passwordHash = await hashPassword(initialPassword, cost);
      const created = await withTransaction(
        async (tx) => {
          const row = await createStaff(tx, { ...toWriteData(body), passwordHash });
          await audit(tx, actor, 'EMPLOYEE_CREATE', row.id, { role: row.role });
          return row;
        },
        { client: db },
      );
      return { profile: toStaffProfile(created), initialPassword };
    },

    /** Edición completa por un ADMIN. Audita EMPLOYEE_UPDATE y, si cambia el rol, ROLE_CHANGE (Req. 12.2). */
    async update(actor: Actor, id: number, body: StaffBody) {
      const target = await requireTarget(id);
      if (target.role === 'ADMIN') throw new ConflictError(STAFF_MESSAGES.adminAccount);
      await requireDepartment(body.departmentId);
      const data = toWriteData(body);
      const fields = changedFields(target, data);
      const updated = await withTransaction(
        async (tx) => {
          const row = await updateStaff(tx, id, data);
          await audit(tx, actor, 'EMPLOYEE_UPDATE', id, { fields });
          if (target.role !== data.role) await audit(tx, actor, 'ROLE_CHANGE', id, { from: target.role, to: data.role });
          return row;
        },
        { client: db },
      );
      return toStaffProfile(updated);
    },

    /** Elimina al Empleado (Req. 5.10, 5.11). Los archivos se borran solo después de confirmar la transacción. */
    async remove(actor: Actor, id: number) {
      const target = await requireTarget(id);
      if (target.id === actor.id) throw new ConflictError(STAFF_MESSAGES.selfDelete);
      if (target.role === 'ADMIN') throw new ConflictError(STAFF_MESSAGES.adminAccount);
      if ((await countActivePatientsOf(db, id)) > 0) throw new ConflictError(STAFF_MESSAGES.activePatients);
      const documentPaths = await listDocumentPaths(db, id);
      await withTransaction(
        async (tx) => {
          await audit(tx, actor, 'EMPLOYEE_DELETE', id, { role: target.role });
          await deleteStaff(tx, id);
        },
        { client: db },
      );
      const photo = photoFilenameOf(target.photoUrl);
      if (photo !== null) await photos.remove(photo).catch(() => undefined);
      await documents.removeAll(documentPaths);
    },

    /** PATCH /staff/me: teléfono y quitar la foto. Una foto nueva se carga con POST /staff/:id/photo. */
    async patchOwnProfile(actor: Actor, body: PatchMeBody) {
      const target = await requireTarget(actor.id);
      const fields: string[] = [];
      let removePhoto = false;
      if (body.photoUrl !== undefined) {
        if (body.photoUrl === null) {
          if (target.photoUrl !== null) {
            removePhoto = true;
            fields.push('photoUrl');
          }
        } else if (body.photoUrl !== effectivePhotoUrl(target.photoUrl)) {
          throw new ValidationError('Los datos enviados no son válidos.', [{ field: 'photoUrl', message: STAFF_MESSAGES.photoUrl }]);
        }
      }
      const newPhone = body.phone !== undefined && body.phone !== target.phone ? body.phone : null;
      if (newPhone !== null) fields.push('phone');
      if (fields.length === 0) return toStaffProfile(target);

      await withTransaction(
        async (tx) => {
          if (newPhone !== null) await setPhone(tx, actor.id, newPhone);
          if (removePhoto) await setPhotoUrl(tx, actor.id, null);
          await audit(tx, actor, 'EMPLOYEE_UPDATE', actor.id, { fields });
        },
        { client: db },
      );
      const oldPhoto = removePhoto ? photoFilenameOf(target.photoUrl) : null;
      if (oldPhoto !== null) await photos.remove(oldPhoto).catch(() => undefined);
      return toStaffProfile(await requireTarget(actor.id));
    },

    /** PUT /staff/:id/schedule: reemplaza el horario semanal; si algún día es inválido no cambia nada (Req. 5.15, 5.16). */
    async replaceSchedule(actor: Actor, id: number, body: ScheduleBody) {
      requireSelfOrAdmin(actor, id);
      const target = await requireTarget(id);
      requireManageable(actor, target);

      const errors: FieldError[] = [];
      const seen = new Set<number>();
      const days: ScheduleDayData[] = [];
      body.days.forEach((day, index) => {
        const prefix = `days.${index}`;
        if (seen.has(day.dayOfWeek)) errors.push({ field: `${prefix}.dayOfWeek`, message: STAFF_MESSAGES.duplicateDay });
        seen.add(day.dayOfWeek);
        for (const error of validateDaySchedule({ startTime: day.startTime, endTime: day.endTime, mealStart: day.mealStart ?? null, mealEnd: day.mealEnd ?? null, breaks: day.breaks })) {
          errors.push({ field: `${prefix}.${error.field}`, message: error.message });
        }
        days.push({
          dayOfWeek: day.dayOfWeek,
          startTime: day.startTime,
          endTime: day.endTime,
          mealStart: day.mealStart ? day.mealStart : null,
          mealEnd: day.mealEnd ? day.mealEnd : null,
          breaks: day.breaks.map((b) => ({ startTime: b.startTime, endTime: b.endTime })),
        });
      });
      if (errors.length > 0) throw new ValidationError(STAFF_MESSAGES.invalidSchedule, errors);

      const slots = await withTransaction(
        async (tx) => {
          const saved = await replaceSchedule(tx, id, days);
          await audit(tx, actor, 'EMPLOYEE_UPDATE', id, { fields: ['schedule'] });
          return saved;
        },
        { client: db },
      );
      return toWorkDays(slots);
    },

    /** POST /staff/:id/photo: valida, guarda con nombre nuevo y reemplaza la foto anterior solo si todo salió bien (Req. 5.13, 5.14). */
    async uploadPhoto(actor: Actor, id: number, file: UploadedPhoto | undefined) {
      requireSelfOrAdmin(actor, id);
      const target = await requireTarget(id);
      requireManageable(actor, target);
      if (file === undefined) {
        throw new ValidationError(STAFF_MESSAGES.invalidPhoto, [{ field: 'file', message: STAFF_MESSAGES.noPhoto }]);
      }
      const head = file.buffer.subarray(0, SIGNATURE_BYTES);
      const errors = validateUpload('photo', { size: file.size, declaredType: file.mimetype, head });
      if (errors.length > 0) throw new ValidationError(STAFF_MESSAGES.invalidPhoto, errors);

      const filename = await photos.save(file.buffer, detectFileType(head) === 'png' ? 'png' : 'jpg');
      try {
        await withTransaction(
          async (tx) => {
            await setPhotoUrl(tx, id, photoUrlFor(filename));
            await audit(tx, actor, 'EMPLOYEE_UPDATE', id, { fields: ['photoUrl'] });
          },
          { client: db },
        );
      } catch (error) {
        await photos.remove(filename).catch(() => undefined);
        throw error;
      }
      const previous = photoFilenameOf(target.photoUrl);
      if (previous !== null) await photos.remove(previous).catch(() => undefined);
      return toStaffProfile(await requireTarget(id));
    },

    /** Contenido de una foto cargada, o null si no existe (el nombre debe ser un UUID con extensión jpg o png). */
    async readPhoto(filename: string) {
      const content = await photos.read(filename);
      if (content === null) return null;
      return { content, contentType: filename.endsWith('.png') ? 'image/png' : 'image/jpeg' };
    },

    async departments() {
      return listDepartments(db);
    },
  };
}

export type StaffService = ReturnType<typeof createStaffService>;
