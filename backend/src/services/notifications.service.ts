import type { Role } from '../domain/constants';
import { addDays, localDateOf, zonedTimeToUtc } from '../domain/time';
import type { Database } from '../repositories/database';

export interface Actor { id: number; role: Role }
export type NotificationSeverity = 'info' | 'warning' | 'critical';
export type NotificationKind = 'stock' | 'treatment' | 'equipment' | 'delivery' | 'appointment' | 'room';
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  date: Date;
  /** Solo se incluye cuando el módulo de destino existe en el Frontend. */
  href?: string;
}

export interface NotificationsService {
  list(actor: Actor): Promise<NotificationItem[]>;
}

export function createNotificationsService(db: Database, now: () => Date = () => new Date()): NotificationsService {
  return {
    async list(actor) {
      const current = now();
      const until = zonedTimeToUtc(addDays(localDateOf(current), 7), '23:59');
      const notifications: NotificationItem[] = [];

      if (actor.role === 'ADMIN' || actor.role === 'CLEANING') {
        const products = await db.product.findMany({
          where: {
            quantity: { lte: db.product.fields.minStock },
            ...(actor.role === 'CLEANING' ? { category: 'material de limpieza' } : {}),
          },
          select: { id: true, name: true, category: true, quantity: true, minStock: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });
        for (const product of products) {
          notifications.push({
            id: `stock-${product.id}`,
            kind: 'stock',
            severity: product.quantity === 0 ? 'critical' : 'warning',
            title: product.quantity === 0 ? 'Producto agotado' : 'Stock bajo',
            message: `${product.name}: ${product.quantity} unidades disponibles (mínimo ${product.minStock}).`,
            date: product.updatedAt,
            ...(product.category === 'material de limpieza' ? {} : { href: '/inventario' }),
          });
        }
      }

      if (actor.role === 'ADMIN' || actor.role === 'DOCTOR' || actor.role === 'NURSE') {
        const treatments = await db.treatment.findMany({
          where: {
            status: 'programado',
            scheduledAt: { gte: current, lte: until },
            ...(actor.role === 'DOCTOR' ? { patient: { doctorId: actor.id } } : {}),
            ...(actor.role === 'NURSE' ? { patient: { nurseId: actor.id } } : {}),
          },
          include: { patient: { select: { firstName: true, lastName: true, internalId: true } } },
          orderBy: { scheduledAt: 'asc' },
          take: 20,
        });
        for (const treatment of treatments) {
          notifications.push({
            id: `treatment-${treatment.id}`,
            kind: 'treatment',
            severity: treatment.type === 'cirugía' ? 'warning' : 'info',
            title: treatment.type === 'cirugía' ? 'Cirugía programada' : 'Tratamiento programado',
            message: `${treatment.patient.firstName} ${treatment.patient.lastName} (${treatment.patient.internalId}): ${treatment.description}`,
            date: treatment.scheduledAt,
            href: `/pacientes/${treatment.patientId}`,
          });
        }
      }

      // Citas: el ADMIN ve todas y el DOCTOR solo las suyas. NURSE y CLEANING no tienen acceso al módulo.
      if (actor.role === 'ADMIN' || actor.role === 'DOCTOR') {
        const appointments = await db.appointment.findMany({
          where: {
            status: 'programada',
            scheduledAt: { gte: current, lte: until },
            ...(actor.role === 'DOCTOR' ? { doctorId: actor.id } : {}),
          },
          include: { patient: { select: { firstName: true, lastName: true, internalId: true } } },
          orderBy: { scheduledAt: 'asc' },
          take: 20,
        });
        for (const appointment of appointments) {
          notifications.push({
            id: `appointment-${appointment.id}`,
            kind: 'appointment',
            severity: 'info',
            title: 'Cita próxima',
            message: `${appointment.patient.firstName} ${appointment.patient.lastName} (${appointment.patient.internalId}): ${appointment.reason}`,
            date: appointment.scheduledAt,
            href: '/citas',
          });
        }
      }

      if (actor.role === 'ADMIN') {
        const [equipment, deliveries, departments] = await Promise.all([
          db.equipment.findMany({
            where: {
              OR: [
                { operationalStatus: { in: ['en mantenimiento', 'fuera de servicio'] } },
                { maintenanceRequired: true },
              ],
            },
            select: { id: true, name: true, operationalStatus: true, maintenanceRequired: true, updatedAt: true },
            take: 20,
          }),
          db.supplierDelivery.findMany({
            where: { status: 'programada', scheduledDate: { gte: current, lte: until } },
            include: { product: { select: { name: true } } },
            orderBy: { scheduledDate: 'asc' },
            take: 20,
          }),
          db.department.findMany({
            select: {
              id: true,
              name: true,
              rooms: {
                select: {
                  capacity: true,
                  assignments: { where: { endedAt: null }, select: { id: true } },
                },
              },
            },
            orderBy: { name: 'asc' },
          }),
        ]);
        for (const item of equipment) {
          const outOfService = item.operationalStatus === 'fuera de servicio';
          const inMaintenance = item.operationalStatus === 'en mantenimiento';
          notifications.push({
            id: `equipment-${item.id}`,
            kind: 'equipment',
            severity: outOfService ? 'critical' : 'warning',
            title: outOfService
              ? 'Equipo fuera de servicio'
              : inMaintenance
                ? 'Equipo en mantenimiento'
                : 'Mantenimiento requerido',
            message: item.name,
            date: item.updatedAt,
          });
        }
        for (const delivery of deliveries) {
          notifications.push({
            id: `delivery-${delivery.id}`,
            kind: 'delivery',
            severity: 'info',
            title: 'Entrega próxima',
            message: `${delivery.product.name}: ${delivery.quantityRequested} unidades solicitadas.`,
            date: delivery.scheduledDate,
          });
        }
        for (const department of departments) {
          const capacity = department.rooms.reduce((total, room) => total + room.capacity, 0);
          const occupied = department.rooms.reduce((total, room) => total + room.assignments.length, 0);
          const available = capacity - occupied;
          if (capacity === 0 || available > 0) continue;
          notifications.push({
            id: `room-${department.id}`,
            kind: 'room',
            severity: 'critical',
            title: 'Departamento sin disponibilidad',
            message: `${department.name}: ${occupied} de ${capacity} camas ocupadas.`,
            date: current,
            href: '/habitaciones',
          });
        }
      }

      const weight: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 };
      return notifications
        .sort((a, b) => weight[a.severity] - weight[b.severity] || a.date.getTime() - b.date.getTime())
        .slice(0, 50);
    },
  };
}
