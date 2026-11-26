// Servicio del Dashboard administrativo (Req. 4, 8.8, 23.6).

import type { DeliveryStatus, PatientStatus, ReleaseReason, Role, StoredEventType } from '../domain/constants';
import { computeDashboardStats, type DashboardData } from '../domain/dashboard';
import { fromDelivery, fromEvent, upcomingWindow } from '../domain/events';
import { readDashboardData } from '../repositories/dashboard.repository';
import type { Database } from '../repositories/database';

export interface DashboardServiceOptions {
  db: Database;
  now?: () => Date;
}

export function createDashboardService(options: DashboardServiceOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  return {
    async get() {
      const snapshot = await readDashboardData(db);
      const data: DashboardData = {
        users: snapshot.users.map((user) => ({ role: user.role as Role, active: user.active })),
        patients: snapshot.patients.map((patient) => ({ status: patient.status as PatientStatus })),
        departments: snapshot.departments,
        rooms: snapshot.rooms,
        assignments: snapshot.assignments.map((assignment) => ({
          roomId: assignment.roomId,
          patientId: assignment.patientId,
          departmentId: assignment.room.departmentId,
          startedAt: assignment.startedAt,
          endedAt: assignment.endedAt,
          releaseReason: assignment.releaseReason as ReleaseReason | null,
        })),
        products: snapshot.products,
        equipment: snapshot.equipment.map((item) => ({
          operationalStatus: item.operationalStatus as DashboardData['equipment'][number]['operationalStatus'],
        })),
      };

      const events = snapshot.events.map((event) => fromEvent({
        id: event.id,
        title: event.title,
        type: event.type as StoredEventType,
        startAt: event.startAt,
        endAt: event.endAt,
      }));
      const deliveries = snapshot.deliveries.map((delivery) => fromDelivery({
        id: delivery.id,
        status: delivery.status as DeliveryStatus,
        scheduledDate: delivery.scheduledDate,
        supplierName: delivery.supplier.name,
        productName: delivery.product.name,
        quantityRequested: delivery.quantityRequested,
      }));

      const stats = computeDashboardStats(data);
      return {
        data: {
          ...stats,
          byDepartment: stats.byDepartment.map((item) => ({
            ...item,
            department: snapshot.departments.find((department) => department.id === item.departmentId) ?? { id: item.departmentId, name: `Departamento ${item.departmentId}` },
          })),
          upcoming: upcomingWindow([...events, ...deliveries], now()),
        },
      };
    },
  };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
