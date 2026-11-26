// Prueba de propiedades de las estadísticas del dashboard (tarea 3.36, Property 21).
//
// Se generan Departamentos (algunos sin Habitaciones), Habitaciones con capacidad de 1 a 4 y entre 0 y
// `capacidad` Asignaciones activas (más algunas cerradas), usuarios de todos los roles activos e
// inactivos, Pacientes de los tres estados, Productos de ambos inventarios con cantidades cercanas al
// Stock_Mínimo y Equipos de los cuatro Estados_Operativos. Un oráculo independiente cuenta cada valor
// directamente y calcula el porcentaje con aritmética entera (redondeo de .5 hacia arriba), sin usar
// las funciones de dominio. También se comprueba que calcular sobre datos distintos no reutiliza
// valores previos y que la entrada no se modifica.
// El dashboard solo usa Asignaciones activas (sin rangos de fechas), por lo que no depende de la
// diferencia pendiente entre los Req. 27.4 y 27.5.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_STATUSES,
  PATIENT_STATUSES,
  PRODUCT_CATEGORIES,
  ROLES,
  type OperationalStatus,
  type PatientStatus,
  type ProductCategory,
  type Role,
} from '../../src/domain/constants';
import { computeDashboardStats, type DashboardData } from '../../src/domain/dashboard';
import type { AssignmentLike } from '../../src/domain/rooms';

const RUNS = { numRuns: 100 };

interface Generated {
  data: DashboardData;
  /** Activas por Habitación, según se generaron (para el oráculo). */
  activeByRoom: Map<number, number>;
  /** Categoría de cada Producto (para comprobar que ambos inventarios se generan). */
  categories: ProductCategory[];
}

const productArb = fc
  .record({
    category: fc.constantFrom(...PRODUCT_CATEGORIES),
    minStock: fc.integer({ min: 0, max: 20 }),
    offset: fc.oneof({ arbitrary: fc.constantFrom(-1, 0, 1), weight: 3 }, fc.integer({ min: -20, max: 50 })),
    zero: fc.boolean(),
  })
  .map(({ category, minStock, offset, zero }) => ({ category, minStock, quantity: zero ? 0 : Math.max(0, minStock + offset) }));

const dataArb: fc.Arbitrary<Generated> = fc
  .record({
    users: fc.array(fc.record({ role: fc.constantFrom<Role>(...ROLES), active: fc.boolean() }), { maxLength: 15 }),
    patients: fc.array(fc.record({ status: fc.constantFrom<PatientStatus>(...PATIENT_STATUSES) }), { maxLength: 20 }),
    departmentIds: fc.uniqueArray(fc.integer({ min: 1, max: 8 }), { maxLength: 6 }),
    rooms: fc.array(
      fc.record({
        deptPick: fc.nat(),
        capacity: fc.integer({ min: 1, max: 4 }),
        fill: fc.oneof({ arbitrary: fc.constantFrom('empty', 'full'), weight: 2 }, fc.constant('random')),
        activePick: fc.nat(),
        endedCount: fc.integer({ min: 0, max: 2 }),
      }),
      { maxLength: 12 },
    ),
    products: fc.array(productArb, { maxLength: 15 }),
    equipment: fc.array(fc.record({ operationalStatus: fc.constantFrom<OperationalStatus>(...OPERATIONAL_STATUSES) }), { maxLength: 15 }),
    shuffleSeed: fc.nat(),
  })
  .map(({ users, patients, departmentIds, rooms, products, equipment, shuffleSeed }) => {
    const roomList: { id: number; departmentId: number; capacity: number }[] = [];
    const assignments: AssignmentLike[] = [];
    const activeByRoom = new Map<number, number>();
    let patientId = 1;
    if (departmentIds.length > 0) {
      rooms.forEach((r, index) => {
        const id = 100 + index;
        const departmentId = departmentIds[r.deptPick % departmentIds.length]!;
        const activeCount = r.fill === 'empty' ? 0 : r.fill === 'full' ? r.capacity : r.activePick % (r.capacity + 1);
        roomList.push({ id, departmentId, capacity: r.capacity });
        activeByRoom.set(id, activeCount);
        const base = { roomId: id, departmentId, startedAt: new Date('2026-02-01T10:00:00Z') };
        for (let i = 0; i < activeCount; i++) assignments.push({ ...base, patientId: patientId++, endedAt: null, releaseReason: null });
        for (let i = 0; i < r.endedCount; i++) {
          assignments.push({ ...base, patientId: patientId++, endedAt: new Date('2026-02-03T10:00:00Z'), releaseReason: i % 2 === 0 ? 'alta' : 'fallecimiento' });
        }
      });
    }
    // Orden de las Asignaciones mezclado de forma determinista.
    const shuffled = assignments
      .map((a, i) => ({ a, k: (i * 7919 + shuffleSeed) % 104729 }))
      .sort((x, y) => x.k - y.k)
      .map((x) => x.a);
    return {
      data: {
        users,
        patients,
        departments: departmentIds.map((id) => ({ id })),
        rooms: roomList,
        assignments: shuffled,
        products: products.map(({ quantity, minStock }) => ({ quantity, minStock })),
        equipment,
      },
      activeByRoom,
      categories: products.map((p) => p.category),
    };
  });

function oracle({ data, activeByRoom }: Generated) {
  const count = <T>(list: readonly T[], f: (x: T) => boolean) => list.filter(f).length;
  const occupiedRoom = (r: { id: number; capacity: number }) => activeByRoom.get(r.id) === r.capacity;
  const percent = (occupied: number, total: number) => (total === 0 ? 0 : Math.floor((200 * occupied + total) / (2 * total)));
  return {
    cards: {
      employees: count(data.users, (u) => u.active && (u.role === 'DOCTOR' || u.role === 'NURSE' || u.role === 'CLEANING')),
      activePatients: count(data.patients, (p) => p.status === 'activo'),
      availableRooms: count(data.rooms, (r) => !occupiedRoom(r)),
      occupiedRooms: count(data.rooms, occupiedRoom),
      lowStockProducts: count(data.products, (p) => p.quantity <= p.minStock),
      equipmentInMaintenance: count(data.equipment, (e) => e.operationalStatus === 'en mantenimiento'),
    },
    indicators: {
      dischargedPatients: count(data.patients, (p) => p.status === 'dado de alta'),
      deceasedPatients: count(data.patients, (p) => p.status === 'fallecido'),
      outOfServiceEquipment: count(data.equipment, (e) => e.operationalStatus === 'fuera de servicio'),
      outOfStockProducts: count(data.products, (p) => p.quantity === 0),
    },
    byDepartment: [...data.departments]
      .map((d) => d.id)
      .sort((a, b) => a - b)
      .map((departmentId) => {
        const rooms = data.rooms.filter((r) => r.departmentId === departmentId);
        const occupied = count(rooms, occupiedRoom);
        return { departmentId, occupied, total: rooms.length, percentage: percent(occupied, rooms.length) };
      }),
  };
}

function expectValid(stats: ReturnType<typeof computeDashboardStats>) {
  expect(Object.keys(stats.cards)).toHaveLength(6);
  const values = [...Object.values(stats.cards), ...Object.values(stats.indicators), ...stats.byDepartment.flatMap((d) => [d.occupied, d.total, d.percentage])];
  for (const v of values) {
    expect(Number.isInteger(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(0);
  }
  for (const d of stats.byDepartment) expect(d.percentage).toBeLessThanOrEqual(100);
}

describe('Dashboard (propiedades)', () => {
  // Feature: hospital-management-system, Property 21: Estadísticas e indicadores del dashboard
  it('Property 21: seis tarjetas e indicadores enteros iguales a los conteos, ocupación por Departamento con round(100 × ocupadas / total) y 0 sin Habitaciones, sin reutilizar valores previos', () => {
    fc.assert(
      fc.property(dataArb, dataArb, (first, second) => {
        const firstCopy = structuredClone(first.data);
        const secondCopy = structuredClone(second.data);

        const a = computeDashboardStats(first.data);
        expectValid(a);
        expect(a).toEqual(oracle(first));

        // Datos distintos: el resultado corresponde a los datos nuevos.
        const b = computeDashboardStats(second.data);
        expectValid(b);
        expect(b).toEqual(oracle(second));

        // Modificar un resultado anterior no afecta a cálculos posteriores.
        a.cards.employees += 1000;
        for (const d of a.byDepartment) d.percentage = 999;
        expect(computeDashboardStats(first.data)).toEqual(oracle(first));

        expect(first.data).toEqual(firstCopy);
        expect(second.data).toEqual(secondCopy);
      }),
      RUNS,
    );
  });

  it('el generador produce Productos de limpieza y del inventario médico, Departamentos sin Habitaciones y porcentajes intermedios', () => {
    // Control del generador (no es una propiedad): en 300 muestras aparecen los casos que interesan.
    const samples = fc.sample(dataArb, { numRuns: 300, seed: 3360 });
    const stats = samples.map((s) => ({ s, r: oracle(s) }));
    expect(samples.some((s) => s.categories.includes('material de limpieza') && s.data.products.some((p, i) => p.quantity === 0 && s.categories[i] === 'material de limpieza'))).toBe(true);
    expect(samples.some((s) => s.categories.some((c) => c !== 'material de limpieza'))).toBe(true);
    expect(stats.some(({ r }) => r.byDepartment.some((d) => d.total === 0))).toBe(true);
    expect(stats.some(({ r }) => r.byDepartment.some((d) => d.percentage > 0 && d.percentage < 100))).toBe(true);
    expect(stats.some(({ r }) => r.byDepartment.some((d) => d.percentage === 100))).toBe(true);
    expect(samples.some((s) => s.data.users.some((u) => !u.active && u.role !== 'ADMIN'))).toBe(true);
  });
});
