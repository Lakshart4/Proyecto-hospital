// Estadísticas e indicadores del Módulo_Dashboard (Req. 4.1, 4.4, 4.5, 4.9, 8.8, 23.6).
//
// `computeDashboardStats` es una función pura: recibe los datos leídos de la base de datos en la
// solicitud actual y calcula todo de nuevo, sin caché ni estado entre llamadas (Req. 4.4, 4.5).
// Reutiliza las reglas ya aprobadas:
// - Empleado: usuario con rol distinto de ADMIN y activo (los inactivos no cuentan).
// - Stock_Bajo (`isLowStock`) y agotado (`availabilityOf`) sobre los Productos de ambos inventarios.
// - Disponibilidad_de_Habitación (`roomAvailability`, mediante `occupancyCounters`) con las
//   Asignaciones activas; lanza RangeError si una Habitación tiene más Asignaciones activas que capacidad.
// - Ocupación por Departamento: porcentaje entero round(100 × ocupadas / total), 0 sin Habitaciones.

import type { OperationalStatus, PatientStatus, Role } from './constants';
import { occupancyCounters, type AssignmentLike, type RoomLike } from './rooms';
import { availabilityOf, isLowStock } from './stock';

export interface DashboardData {
  users: readonly { role: Role; active: boolean }[];
  patients: readonly { status: PatientStatus }[];
  /** Todos los Departamentos; cada uno aparece en `byDepartment`, tenga o no Habitaciones. */
  departments: readonly { id: number }[];
  rooms: readonly RoomLike[];
  /** Asignaciones de las Habitaciones; solo cuentan las activas (`endedAt` nulo). */
  assignments: readonly AssignmentLike[];
  /** Productos de ambos inventarios (médico y de limpieza). */
  products: readonly { quantity: number; minStock: number }[];
  equipment: readonly { operationalStatus: OperationalStatus }[];
}

export interface Cards {
  employees: number;
  activePatients: number;
  availableRooms: number;
  occupiedRooms: number;
  lowStockProducts: number;
  equipmentInMaintenance: number;
}

export interface Indicators {
  dischargedPatients: number;
  deceasedPatients: number;
  outOfServiceEquipment: number;
  outOfStockProducts: number;
}

export interface DeptOccupancy {
  departmentId: number;
  occupied: number;
  total: number;
  /** Entero de 0 a 100. */
  percentage: number;
}

export interface DashboardStats {
  cards: Cards;
  indicators: Indicators;
  byDepartment: DeptOccupancy[];
}

const countWhere = <T>(items: readonly T[], predicate: (item: T) => boolean): number =>
  items.reduce((count, item) => (predicate(item) ? count + 1 : count), 0);

/** Porcentaje de ocupación entero: round(100 × ocupadas / total), o 0 si no hay Habitaciones. */
export function occupancyPercentage(occupied: number, total: number): number {
  return total === 0 ? 0 : Math.round((100 * occupied) / total);
}

/**
 * Seis tarjetas, indicadores adicionales y ocupación por Departamento ordenada por id.
 * @throws RangeError si una Habitación pertenece a un Departamento que no está en `departments`, si una
 * Habitación tiene más Asignaciones activas que capacidad o si un Producto tiene cantidades inválidas.
 */
export function computeDashboardStats(data: DashboardData): DashboardStats {
  const knownDepartments = new Set(data.departments.map((d) => d.id));
  for (const room of data.rooms) {
    if (!knownDepartments.has(room.departmentId)) {
      throw new RangeError(`La habitación ${room.id} pertenece a un departamento inexistente (${room.departmentId}).`);
    }
  }

  const rooms = occupancyCounters(data.rooms, data.assignments);
  const roomsByDepartment = new Map(rooms.byDepartment.map((d) => [d.departmentId, d]));

  return {
    cards: {
      employees: countWhere(data.users, (u) => u.role !== 'ADMIN' && u.active),
      activePatients: countWhere(data.patients, (p) => p.status === 'activo'),
      availableRooms: rooms.total.available,
      occupiedRooms: rooms.total.occupied,
      lowStockProducts: countWhere(data.products, (p) => isLowStock(p.quantity, p.minStock)),
      equipmentInMaintenance: countWhere(data.equipment, (e) => e.operationalStatus === 'en mantenimiento'),
    },
    indicators: {
      dischargedPatients: countWhere(data.patients, (p) => p.status === 'dado de alta'),
      deceasedPatients: countWhere(data.patients, (p) => p.status === 'fallecido'),
      outOfServiceEquipment: countWhere(data.equipment, (e) => e.operationalStatus === 'fuera de servicio'),
      outOfStockProducts: countWhere(data.products, (p) => availabilityOf(p.quantity) === 'agotado'),
    },
    byDepartment: data.departments.map((d) => {
      const counts = roomsByDepartment.get(d.id);
      const occupied = counts?.occupied ?? 0;
      const total = counts?.total ?? 0;
      return { departmentId: d.id, occupied, total, percentage: occupancyPercentage(occupied, total) };
    }).sort((a, b) => a.departmentId - b.departmentId),
  };
}
