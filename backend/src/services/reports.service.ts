import type { Database } from '../repositories/database';

export interface ReportRange { from: Date; to: Date }
export interface ReportsService {
  summary(range: ReportRange): Promise<{
    generatedAt: Date;
    from: Date;
    to: Date;
    activity: {
      admissions: number;
      discharges: number;
      deaths: number;
      treatmentsPerformed: number;
      surgeriesScheduled: number;
      inventoryEntries: number;
      inventoryExits: number;
      inventoryAdjustments: number;
      deliveriesReceived: number;
    };
    patients: { active: number; discharged: number; deceased: number };
    occupancy: { departmentId: number; department: string; rooms: number; occupiedRooms: number; activeAssignments: number; capacity: number }[];
  }>;
}

export function createReportsService(db: Database, now: () => Date = () => new Date()): ReportsService {
  return {
    async summary({ from, to }) {
      const movementWhere = { occurredAt: { gte: from, lte: to } };
      const inventoryWhere = { createdAt: { gte: from, lte: to } };
      const [
        admissions, discharges, deaths, treatmentsPerformed, surgeriesScheduled,
        inventoryEntries, inventoryExits, inventoryAdjustments, deliveriesReceived,
        active, discharged, deceased, departments,
      ] = await Promise.all([
        db.patientMovement.count({ where: { ...movementWhere, type: 'ingreso' } }),
        db.patientMovement.count({ where: { ...movementWhere, type: 'alta' } }),
        db.patientMovement.count({ where: { ...movementWhere, type: 'fallecimiento' } }),
        db.treatment.count({ where: { status: 'realizado', performedAt: { gte: from, lte: to } } }),
        db.treatment.count({ where: { type: 'cirugía', scheduledAt: { gte: from, lte: to } } }),
        db.inventoryMovement.count({ where: { ...inventoryWhere, type: 'entrada' } }),
        db.inventoryMovement.count({ where: { ...inventoryWhere, type: 'salida' } }),
        db.inventoryMovement.count({ where: { ...inventoryWhere, type: 'ajuste' } }),
        db.supplierDelivery.count({ where: { status: 'recibida', receivedDate: { gte: from, lte: to } } }),
        db.patient.count({ where: { status: 'activo' } }),
        db.patient.count({ where: { status: 'dado de alta' } }),
        db.patient.count({ where: { status: 'fallecido' } }),
        db.department.findMany({
          orderBy: { name: 'asc' },
          include: {
            rooms: {
              include: { assignments: { where: { endedAt: null }, select: { id: true } } },
            },
          },
        }),
      ]);

      return {
        generatedAt: now(), from, to,
        activity: {
          admissions, discharges, deaths, treatmentsPerformed, surgeriesScheduled,
          inventoryEntries, inventoryExits, inventoryAdjustments, deliveriesReceived,
        },
        patients: { active, discharged, deceased },
        occupancy: departments.map((department) => {
          const rooms = department.rooms;
          const activeAssignments = rooms.reduce((sum, room) => sum + room.assignments.length, 0);
          return {
            departmentId: department.id,
            department: department.name,
            rooms: rooms.length,
            occupiedRooms: rooms.filter((room) => room.assignments.length >= room.capacity).length,
            activeAssignments,
            capacity: rooms.reduce((sum, room) => sum + room.capacity, 0),
          };
        }),
      };
    },
  };
}
