// Lecturas del Módulo_Dashboard (Req. 4, 8.8, 23.6).
// Se seleccionan solo los datos necesarios y se vuelven a leer en cada solicitud; no hay caché.

import type { Database } from './database';

export async function readDashboardData(db: Database) {
  const [users, patients, departments, rooms, assignments, products, equipment, events, deliveries] = await Promise.all([
    db.user.findMany({ select: { role: true, active: true } }),
    db.patient.findMany({ select: { status: true } }),
    db.department.findMany({ select: { id: true, name: true }, orderBy: { id: 'asc' } }),
    db.room.findMany({ select: { id: true, departmentId: true, capacity: true } }),
    db.roomAssignment.findMany({
      select: {
        roomId: true,
        patientId: true,
        startedAt: true,
        endedAt: true,
        releaseReason: true,
        room: { select: { departmentId: true } },
      },
    }),
    db.product.findMany({ select: { quantity: true, minStock: true } }),
    db.equipment.findMany({ select: { operationalStatus: true } }),
    db.event.findMany({ select: { id: true, title: true, type: true, startAt: true, endAt: true } }),
    db.supplierDelivery.findMany({
      select: {
        id: true,
        status: true,
        scheduledDate: true,
        quantityRequested: true,
        supplier: { select: { name: true } },
        product: { select: { name: true } },
      },
    }),
  ]);

  return { users, patients, departments, rooms, assignments, products, equipment, events, deliveries };
}
