// Pruebas de las estadísticas del dashboard (tarea 3.35, Req. 4.1, 4.4, 4.5, 4.9, 8.8, 23.6).
// La Property 21 corresponde a la tarea 3.36.

import { describe, expect, it } from 'vitest';
import { computeDashboardStats, occupancyPercentage, type DashboardData } from '../../src/domain/dashboard';
import type { AssignmentLike } from '../../src/domain/rooms';

const active = (roomId: number, patientId: number, departmentId: number): AssignmentLike => ({
  roomId,
  patientId,
  departmentId,
  startedAt: new Date('2026-01-10T12:00:00Z'),
  endedAt: null,
  releaseReason: null,
});
const ended = (roomId: number, patientId: number, departmentId: number): AssignmentLike => ({
  ...active(roomId, patientId, departmentId),
  endedAt: new Date('2026-01-12T12:00:00Z'),
  releaseReason: 'alta',
});

const EMPTY: DashboardData = { users: [], patients: [], departments: [], rooms: [], assignments: [], products: [], equipment: [] };

function sample(): DashboardData {
  return {
    users: [
      { role: 'ADMIN', active: true },
      { role: 'DOCTOR', active: true },
      { role: 'DOCTOR', active: false },
      { role: 'NURSE', active: true },
      { role: 'CLEANING', active: true },
      { role: 'CLEANING', active: false },
    ],
    patients: [
      { status: 'activo' },
      { status: 'activo' },
      { status: 'activo' },
      { status: 'dado de alta' },
      { status: 'fallecido' },
      { status: 'fallecido' },
    ],
    departments: [{ id: 3 }, { id: 1 }, { id: 2 }],
    rooms: [
      { id: 10, departmentId: 1, capacity: 1 }, // ocupada (1/1)
      { id: 11, departmentId: 1, capacity: 2 }, // disponible (1/2)
      { id: 12, departmentId: 1, capacity: 2 }, // ocupada (2/2)
      { id: 20, departmentId: 2, capacity: 1 }, // disponible (solo una asignación cerrada)
    ],
    assignments: [active(10, 1, 1), active(11, 2, 1), active(12, 3, 1), active(12, 4, 1), ended(20, 5, 2), ended(10, 6, 1)],
    products: [
      { quantity: 0, minStock: 0 }, // agotado y Stock_Bajo (0 ≤ 0)
      { quantity: 5, minStock: 5 }, // Stock_Bajo (límite)
      { quantity: 6, minStock: 5 }, // normal
      { quantity: 0, minStock: 3 }, // agotado y Stock_Bajo (limpieza)
      { quantity: 1, minStock: 0 }, // normal
    ],
    equipment: [
      { operationalStatus: 'disponible' },
      { operationalStatus: 'en uso' },
      { operationalStatus: 'en mantenimiento' },
      { operationalStatus: 'en mantenimiento' },
      { operationalStatus: 'fuera de servicio' },
    ],
  };
}

describe('computeDashboardStats', () => {
  it('calcula las seis tarjetas, los indicadores y la ocupación por Departamento', () => {
    expect(computeDashboardStats(sample())).toEqual({
      cards: {
        employees: 3,
        activePatients: 3,
        availableRooms: 2,
        occupiedRooms: 2,
        lowStockProducts: 3,
        equipmentInMaintenance: 2,
      },
      indicators: { dischargedPatients: 1, deceasedPatients: 2, outOfServiceEquipment: 1, outOfStockProducts: 2 },
      byDepartment: [
        { departmentId: 1, occupied: 2, total: 3, percentage: 67 },
        { departmentId: 2, occupied: 0, total: 1, percentage: 0 },
        { departmentId: 3, occupied: 0, total: 0, percentage: 0 },
      ],
    });
  });

  it('sin datos devuelve todos los valores en 0 y sin Departamentos', () => {
    expect(computeDashboardStats(EMPTY)).toEqual({
      cards: { employees: 0, activePatients: 0, availableRooms: 0, occupiedRooms: 0, lowStockProducts: 0, equipmentInMaintenance: 0 },
      indicators: { dischargedPatients: 0, deceasedPatients: 0, outOfServiceEquipment: 0, outOfStockProducts: 0 },
      byDepartment: [],
    });
  });

  describe('Empleados', () => {
    it('no cuenta al Administrador ni a los usuarios inactivos', () => {
      const stats = computeDashboardStats({
        ...EMPTY,
        users: [
          { role: 'ADMIN', active: true },
          { role: 'ADMIN', active: false },
          { role: 'DOCTOR', active: false },
          { role: 'NURSE', active: false },
          { role: 'CLEANING', active: false },
        ],
      });
      expect(stats.cards.employees).toBe(0);
    });

    it('cuenta a todos los roles de Empleado activos', () => {
      const stats = computeDashboardStats({
        ...EMPTY,
        users: [
          { role: 'DOCTOR', active: true },
          { role: 'NURSE', active: true },
          { role: 'CLEANING', active: true },
        ],
      });
      expect(stats.cards.employees).toBe(3);
    });
  });

  describe('Productos de ambos inventarios', () => {
    it('Stock_Bajo incluye el límite cantidad = mínimo y excluye cantidad = mínimo + 1', () => {
      const stats = computeDashboardStats({ ...EMPTY, products: [{ quantity: 7, minStock: 7 }, { quantity: 8, minStock: 7 }] });
      expect(stats.cards.lowStockProducts).toBe(1);
      expect(stats.indicators.outOfStockProducts).toBe(0);
    });

    it('agotado solo con cantidad 0, sin importar el mínimo', () => {
      const stats = computeDashboardStats({
        ...EMPTY,
        products: [{ quantity: 0, minStock: 0 }, { quantity: 0, minStock: 10 }, { quantity: 1, minStock: 10 }],
      });
      expect(stats.indicators.outOfStockProducts).toBe(2);
      expect(stats.cards.lowStockProducts).toBe(3);
    });

    it('rechaza cantidades inválidas con RangeError (regla de stock aprobada)', () => {
      expect(() => computeDashboardStats({ ...EMPTY, products: [{ quantity: -1, minStock: 0 }] })).toThrow(RangeError);
      expect(() => computeDashboardStats({ ...EMPTY, products: [{ quantity: 1.5, minStock: 0 }] })).toThrow(RangeError);
    });
  });

  describe('Habitaciones y ocupación por Departamento', () => {
    it('un Departamento sin Habitaciones aparece con 0 de 0 y 0 %', () => {
      const stats = computeDashboardStats({ ...EMPTY, departments: [{ id: 5 }] });
      expect(stats.byDepartment).toEqual([{ departmentId: 5, occupied: 0, total: 0, percentage: 0 }]);
      expect(stats.cards.availableRooms).toBe(0);
      expect(stats.cards.occupiedRooms).toBe(0);
    });

    it('todas ocupadas da 100 % y ninguna ocupada da 0 %', () => {
      const stats = computeDashboardStats({
        ...EMPTY,
        departments: [{ id: 1 }, { id: 2 }],
        rooms: [
          { id: 1, departmentId: 1, capacity: 1 },
          { id: 2, departmentId: 1, capacity: 1 },
          { id: 3, departmentId: 2, capacity: 3 },
        ],
        assignments: [active(1, 1, 1), active(2, 2, 1), active(3, 3, 2), active(3, 4, 2)],
      });
      expect(stats.byDepartment).toEqual([
        { departmentId: 1, occupied: 2, total: 2, percentage: 100 },
        { departmentId: 2, occupied: 0, total: 1, percentage: 0 },
      ]);
      expect(stats.cards).toMatchObject({ occupiedRooms: 2, availableRooms: 1 });
    });

    it('una Habitación de un Departamento inexistente provoca RangeError', () => {
      expect(() =>
        computeDashboardStats({ ...EMPTY, departments: [{ id: 1 }], rooms: [{ id: 9, departmentId: 2, capacity: 1 }] }),
      ).toThrow(RangeError);
    });

    it('más Asignaciones activas que capacidad provoca RangeError (decisión A de la 3.8)', () => {
      expect(() =>
        computeDashboardStats({
          ...EMPTY,
          departments: [{ id: 1 }],
          rooms: [{ id: 1, departmentId: 1, capacity: 1 }],
          assignments: [active(1, 1, 1), active(1, 2, 1)],
        }),
      ).toThrow(RangeError);
    });
  });

  it('Equipos: solo "en mantenimiento" cuenta en la tarjeta y solo "fuera de servicio" en el indicador', () => {
    const stats = computeDashboardStats({
      ...EMPTY,
      equipment: [{ operationalStatus: 'disponible' }, { operationalStatus: 'en uso' }, { operationalStatus: 'en mantenimiento' }],
    });
    expect(stats.cards.equipmentInMaintenance).toBe(1);
    expect(stats.indicators.outOfServiceEquipment).toBe(0);
  });

  it('todos los valores son enteros mayores o iguales a 0', () => {
    const stats = computeDashboardStats(sample());
    const values = [...Object.values(stats.cards), ...Object.values(stats.indicators), ...stats.byDepartment.flatMap((d) => [d.occupied, d.total, d.percentage])];
    for (const value of values) {
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('no modifica los datos recibidos', () => {
    const data = sample();
    const copy = structuredClone(data);
    computeDashboardStats(data);
    expect(data).toEqual(copy);
  });

  it('devuelve objetos nuevos en cada llamada y no reutiliza valores previos', () => {
    const data = sample();
    const first = computeDashboardStats(data);
    const second = computeDashboardStats(data);
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.cards).not.toBe(first.cards);
    expect(second.indicators).not.toBe(first.indicators);
    expect(second.byDepartment).not.toBe(first.byDepartment);

    first.cards.employees = 999;
    first.byDepartment[0]!.percentage = 999;
    const changed = computeDashboardStats({ ...data, users: [], equipment: [{ operationalStatus: 'en mantenimiento' }] });
    expect(changed.cards.employees).toBe(0);
    expect(changed.cards.equipmentInMaintenance).toBe(1);
    expect(changed.byDepartment[0]!.percentage).toBe(67);
  });
});

describe('occupancyPercentage', () => {
  it('redondea al entero más cercano y devuelve 0 sin Habitaciones', () => {
    expect(occupancyPercentage(0, 0)).toBe(0);
    expect(occupancyPercentage(0, 3)).toBe(0);
    expect(occupancyPercentage(1, 3)).toBe(33);
    expect(occupancyPercentage(2, 3)).toBe(67);
    expect(occupancyPercentage(1, 8)).toBe(13); // 12.5 → 13
    expect(occupancyPercentage(1, 200)).toBe(1); // 0.5 → 1
    expect(occupancyPercentage(1, 201)).toBe(0); // 0.497… → 0
    expect(occupancyPercentage(5, 5)).toBe(100);
  });
});
