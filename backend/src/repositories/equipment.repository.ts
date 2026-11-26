// Acceso a datos de Equipos_Médicos y Registros_de_Mantenimiento (Req. 8, 26).

import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

export const EQUIPMENT_SELECT = {
  id: true,
  name: true,
  category: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  quantity: true,
  location: true,
  operationalStatus: true,
  maintenanceRequired: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const MAINTENANCE_SELECT = {
  id: true,
  equipmentId: true,
  equipment: { select: { id: true, name: true, category: true, departmentId: true, department: { select: { id: true, name: true } } } },
  type: true,
  startDate: true,
  endDate: true,
  description: true,
  technician: true,
  resultingStatus: true,
} as const;

export async function listEquipment(db: Client) {
  return db.equipment.findMany({ select: EQUIPMENT_SELECT, orderBy: [{ category: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
}

export async function findEquipmentById(db: Client, id: number) {
  return db.equipment.findUnique({ where: { id }, select: EQUIPMENT_SELECT });
}

export interface EquipmentWriteData {
  name: string;
  category: string;
  departmentId: number;
  quantity: number;
  location: string;
  operationalStatus: string;
  maintenanceRequired: boolean;
}

export async function createEquipment(tx: DbClient, data: EquipmentWriteData) {
  return runWithDbErrors({ operation: 'create', referenceField: 'departmentId' }, () =>
    tx.equipment.create({ data, select: EQUIPMENT_SELECT }),
  );
}

export async function updateEquipment(tx: DbClient, id: number, data: EquipmentWriteData) {
  return runWithDbErrors({ operation: 'update', referenceField: 'departmentId' }, () =>
    tx.equipment.update({ where: { id }, data, select: EQUIPMENT_SELECT }),
  );
}

export async function deleteEquipment(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.equipment.delete({ where: { id } }));
}

export async function setEquipmentStatus(tx: DbClient, id: number, operationalStatus: string) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.equipment.update({ where: { id }, data: { operationalStatus }, select: EQUIPMENT_SELECT }),
  );
}

export async function listMaintenanceRecords(db: Client) {
  return db.maintenanceRecord.findMany({
    select: MAINTENANCE_SELECT,
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });
}

export async function findMaintenanceRecord(db: Client, id: number) {
  return db.maintenanceRecord.findUnique({ where: { id }, select: MAINTENANCE_SELECT });
}

export async function listEquipmentMaintenance(db: Client, equipmentId: number) {
  return db.maintenanceRecord.findMany({
    where: { equipmentId },
    select: MAINTENANCE_SELECT,
    orderBy: [{ startDate: 'desc' }, { id: 'desc' }],
  });
}

export async function createMaintenanceRecord(
  tx: DbClient,
  data: { equipmentId: number; type: string; startDate: Date; description: string; technician: string },
) {
  return runWithDbErrors({ operation: 'create', referenceField: 'equipmentId' }, () =>
    tx.maintenanceRecord.create({ data, select: MAINTENANCE_SELECT }),
  );
}

export async function closeMaintenanceRecord(
  tx: DbClient,
  id: number,
  data: { endDate: Date; resultingStatus: string },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.maintenanceRecord.update({ where: { id }, data, select: MAINTENANCE_SELECT }),
  );
}
