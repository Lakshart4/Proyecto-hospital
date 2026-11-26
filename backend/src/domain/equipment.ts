// Reglas puras de Equipos_Médicos y mantenimiento (Req. 26.1–26.3, 26.7).
//
// `equipmentSummary` calcula el resumen de equipamiento con los datos recibidos en cada solicitud:
// suma de cantidades por (categoría, Departamento), totales por categoría, totales por Departamento y
// total general. `canOpenMaintenance` aplica la regla de un solo Registro_de_Mantenimiento en curso.
// `openMaintenance` y `closeMaintenance` son el modelo puro de apertura y cierre (Req. 26.1–26.3):
// reciben el estado y devuelven un estado nuevo o un error tipado, sin modificar la entrada.

import { ConflictError, NotFoundError, ValidationError, type AppError } from '../lib/errors';
import { MAINTENANCE_RESULT_STATUSES, type MaintenanceResultStatus, type OperationalStatus } from './constants';

/** Cantidad de un Equipo_Médico: entero de 1 a 9999 (Req. 8.2). */
export const MIN_EQUIPMENT_QUANTITY = 1;
export const MAX_EQUIPMENT_QUANTITY = 9999;

export interface EquipmentLike {
  category: string;
  departmentId: number;
  quantity: number;
}

export interface EquipmentCell {
  category: string;
  departmentId: number;
  quantity: number;
}

export interface CategoryTotal {
  category: string;
  quantity: number;
}

export interface DepartmentTotal {
  departmentId: number;
  quantity: number;
}

export interface EquipmentSummary {
  cells: EquipmentCell[];
  byCategory: CategoryTotal[];
  byDepartment: DepartmentTotal[];
  total: number;
}

const compareCategory = (a: string, b: string) => a.localeCompare(b, 'es');

/**
 * Resumen de equipamiento (Req. 26.7). Solo aparecen las combinaciones, categorías y Departamentos con
 * algún Equipo. Las celdas se ordenan por categoría y después por Departamento; los totales por
 * categoría, por nombre; los totales por Departamento, por id.
 * @throws RangeError si una cantidad no es un entero de 1 a 9999.
 */
export function equipmentSummary(items: readonly EquipmentLike[]): EquipmentSummary {
  const cells = new Map<string, EquipmentCell>();
  const byCategory = new Map<string, number>();
  const byDepartment = new Map<number, number>();
  let total = 0;

  for (const item of items) {
    if (!Number.isSafeInteger(item.quantity) || item.quantity < MIN_EQUIPMENT_QUANTITY || item.quantity > MAX_EQUIPMENT_QUANTITY) {
      throw new RangeError(`La cantidad del equipo debe ser un entero de ${MIN_EQUIPMENT_QUANTITY} a ${MAX_EQUIPMENT_QUANTITY} (recibido: ${item.quantity}).`);
    }
    const key = JSON.stringify([item.category, item.departmentId]);
    const cell = cells.get(key) ?? { category: item.category, departmentId: item.departmentId, quantity: 0 };
    cell.quantity += item.quantity;
    cells.set(key, cell);
    byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.quantity);
    byDepartment.set(item.departmentId, (byDepartment.get(item.departmentId) ?? 0) + item.quantity);
    total += item.quantity;
  }

  return {
    cells: [...cells.values()].sort((a, b) => compareCategory(a.category, b.category) || a.departmentId - b.departmentId),
    byCategory: [...byCategory].map(([category, quantity]) => ({ category, quantity })).sort((a, b) => compareCategory(a.category, b.category)),
    byDepartment: [...byDepartment].map(([departmentId, quantity]) => ({ departmentId, quantity })).sort((a, b) => a.departmentId - b.departmentId),
    total,
  };
}

/**
 * Un Equipo admite un nuevo Registro_de_Mantenimiento solo si no tiene ninguno en curso (Req. 26.3);
 * si no, el llamador responde 409.
 * @throws RangeError si `openRecords` no es un entero mayor o igual a 0.
 */
export function canOpenMaintenance(openRecords: number): boolean {
  if (!Number.isSafeInteger(openRecords) || openRecords < 0) {
    throw new RangeError(`openRecords debe ser un entero mayor o igual a 0 (recibido: ${openRecords}).`);
  }
  return openRecords === 0;
}

// ---------- Apertura y cierre de mantenimientos (Req. 26.1–26.3) ----------

export interface EquipmentStatusLike {
  id: number;
  operationalStatus: OperationalStatus;
}

export interface MaintenanceRecordLike {
  id: number;
  equipmentId: number;
  startDate: Date;
  /** null mientras el registro está en curso. */
  endDate: Date | null;
  /** Estado_Operativo resultante, al cerrar. */
  resultingStatus: MaintenanceResultStatus | null;
}

export interface MaintenanceState {
  equipment: readonly EquipmentStatusLike[];
  records: readonly MaintenanceRecordLike[];
}

export type MaintenanceRuleResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

export const MAINTENANCE_MESSAGES = {
  equipmentNotFound: 'El equipo no existe.',
  recordNotFound: 'El registro de mantenimiento no existe.',
  alreadyOpen: 'El equipo ya tiene un mantenimiento en curso.',
  alreadyClosed: 'El registro de mantenimiento ya está cerrado.',
  startDateInFuture: 'La fecha de inicio no puede ser posterior a hoy.',
  endDateBeforeStart: 'La fecha de fin no puede ser anterior a la fecha de inicio.',
  invalidResultingStatus: 'El estado resultante debe ser "disponible" o "fuera de servicio".',
} as const;

const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());
const invalid = (field: string, message: string) => ({ ok: false as const, error: new ValidationError(message, [{ field, message }]) });
const isOpen = (record: MaintenanceRecordLike) => record.endDate === null;

/**
 * Abre un Registro_de_Mantenimiento (Req. 26.1, 26.3). Errores, en este orden: 400 si la fecha de inicio
 * es posterior a `today` (instante actual); 404 si el Equipo no existe; 409 si ya tiene un registro en
 * curso. Si es válido, agrega el registro en curso y deja el Equipo "en mantenimiento".
 * Los demás campos (tipo, descripción, técnico) los valida el esquema de la solicitud.
 */
export function openMaintenance(
  state: MaintenanceState,
  input: { equipmentId: number; startDate: Date },
  today: Date,
): MaintenanceRuleResult<{ state: MaintenanceState; record: MaintenanceRecordLike }> {
  if (!isValidDate(today)) throw new RangeError('today no es una fecha válida.');
  if (!isValidDate(input.startDate) || input.startDate.getTime() > today.getTime()) {
    return invalid('startDate', MAINTENANCE_MESSAGES.startDateInFuture);
  }
  const equipment = state.equipment.find((e) => e.id === input.equipmentId);
  if (!equipment) return { ok: false, error: new NotFoundError(MAINTENANCE_MESSAGES.equipmentNotFound) };
  const openCount = state.records.filter((r) => r.equipmentId === equipment.id && isOpen(r)).length;
  if (!canOpenMaintenance(openCount)) return { ok: false, error: new ConflictError(MAINTENANCE_MESSAGES.alreadyOpen) };

  const record: MaintenanceRecordLike = {
    id: state.records.reduce((max, r) => Math.max(max, r.id), 0) + 1,
    equipmentId: equipment.id,
    startDate: new Date(input.startDate.getTime()),
    endDate: null,
    resultingStatus: null,
  };
  return {
    ok: true,
    value: {
      record,
      state: {
        equipment: state.equipment.map((e) => (e.id === equipment.id ? { ...e, operationalStatus: 'en mantenimiento' } : e)),
        records: [...state.records, record],
      },
    },
  };
}

const isResultingStatus = (value: unknown): value is MaintenanceResultStatus =>
  typeof value === 'string' && (MAINTENANCE_RESULT_STATUSES as readonly string[]).includes(value);

/**
 * Cierra un Registro_de_Mantenimiento en curso (Req. 26.2). Errores, en este orden: 400 si el estado
 * resultante no es "disponible" ni "fuera de servicio"; 404 si el registro no existe; 409 si ya está
 * cerrado; 400 si la fecha de fin es anterior a la de inicio. Si es válido, guarda la fecha de fin y el
 * estado resultante, y deja el Equipo en ese estado.
 */
export function closeMaintenance(
  state: MaintenanceState,
  input: { recordId: number; endDate: Date; resultingStatus: unknown },
): MaintenanceRuleResult<{ state: MaintenanceState; record: MaintenanceRecordLike }> {
  if (!isResultingStatus(input.resultingStatus)) return invalid('resultingStatus', MAINTENANCE_MESSAGES.invalidResultingStatus);
  const resultingStatus = input.resultingStatus;
  const record = state.records.find((r) => r.id === input.recordId);
  if (!record) return { ok: false, error: new NotFoundError(MAINTENANCE_MESSAGES.recordNotFound) };
  if (!isOpen(record)) return { ok: false, error: new ConflictError(MAINTENANCE_MESSAGES.alreadyClosed) };
  if (!isValidDate(input.endDate) || input.endDate.getTime() < record.startDate.getTime()) {
    return invalid('endDate', MAINTENANCE_MESSAGES.endDateBeforeStart);
  }

  const closed: MaintenanceRecordLike = { ...record, endDate: new Date(input.endDate.getTime()), resultingStatus };
  return {
    ok: true,
    value: {
      record: closed,
      state: {
        equipment: state.equipment.map((e) => (e.id === record.equipmentId ? { ...e, operationalStatus: resultingStatus } : e)),
        records: state.records.map((r) => (r.id === record.id ? closed : r)),
      },
    },
  };
}
