// Servicio de Equipos_Médicos y Registros_de_Mantenimiento (Req. 8, 26).
//
// Abrir y cerrar mantenimiento usan las reglas puras de `domain/equipment.ts` y se guardan junto con el
// nuevo Estado_Operativo del Equipo y su entrada de auditoría en una transacción.

import type { MaintenanceResultStatus, OperationalStatus } from '../domain/constants';
import {
  MAINTENANCE_MESSAGES,
  closeMaintenance,
  equipmentSummary,
  openMaintenance,
  type EquipmentStatusLike,
  type MaintenanceRecordLike,
  type MaintenanceState,
} from '../domain/equipment';
import { applyFilters, dateRange, equals, search } from '../domain/filters';
import { parsePagination, toPage } from '../domain/others';
import { NotFoundError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  closeMaintenanceRecord,
  createEquipment,
  createMaintenanceRecord,
  deleteEquipment,
  findEquipmentById,
  findMaintenanceRecord,
  listEquipment,
  listEquipmentMaintenance,
  listMaintenanceRecords,
  setEquipmentStatus,
  updateEquipment,
  type EquipmentWriteData,
} from '../repositories/equipment.repository';
import { withTransaction } from '../repositories/transaction';
import type {
  CloseMaintenanceBody,
  EquipmentBody,
  EquipmentListQuery,
  EquipmentStatusBody,
  MaintenanceBody,
  MaintenanceListQuery,
} from '../schemas/equipment';
import type { Actor } from './staff.service';

export const EQUIPMENT_MESSAGES = { notFound: 'El equipo no existe.' } as const;

export interface EquipmentServiceOptions {
  db: Database;
  now?: () => Date;
}

type EquipmentRow = Awaited<ReturnType<typeof listEquipment>>[number];
type RecordRow = Awaited<ReturnType<typeof listMaintenanceRecords>>[number];

const toStatusLike = (row: EquipmentRow): EquipmentStatusLike => ({
  id: row.id,
  operationalStatus: row.operationalStatus as OperationalStatus,
});

const toRecordLike = (row: RecordRow): MaintenanceRecordLike => ({
  id: row.id,
  equipmentId: row.equipmentId,
  startDate: row.startDate,
  endDate: row.endDate,
  resultingStatus: row.resultingStatus as MaintenanceResultStatus | null,
});

export function createEquipmentService(options: EquipmentServiceOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  const requireEquipment = async (id: number) => {
    const equipment = await findEquipmentById(db, id);
    if (equipment === null) throw new NotFoundError(EQUIPMENT_MESSAGES.notFound);
    return equipment;
  };

  return {
    async list(query: EquipmentListQuery) {
      const rows = await listEquipment(db);
      return {
        data: applyFilters(rows, [
          equals((e) => e.departmentId, query.departmentId),
          equals((e) => e.category, query.category),
          equals((e) => e.operationalStatus, query.status),
          search((e) => [e.name, e.location], query.search),
        ]),
      };
    },

    async summary() {
      const rows = await listEquipment(db);
      return { data: equipmentSummary(rows) };
    },

    async get(id: number) {
      return requireEquipment(id);
    },

    async create(body: EquipmentBody) {
      return withTransaction((tx) => createEquipment(tx, body as EquipmentWriteData), { client: db });
    },

    async update(id: number, body: EquipmentBody) {
      await requireEquipment(id);
      return withTransaction((tx) => updateEquipment(tx, id, body as EquipmentWriteData), { client: db });
    },

    async remove(id: number) {
      await requireEquipment(id);
      await withTransaction((tx) => deleteEquipment(tx, id), { client: db });
    },

    async changeStatus(actor: Actor, id: number, body: EquipmentStatusBody) {
      return withTransaction(
        async (tx) => {
          const equipment = await findEquipmentById(tx, id);
          if (equipment === null) throw new NotFoundError(EQUIPMENT_MESSAGES.notFound);
          const updated = await setEquipmentStatus(tx, id, body.operationalStatus);
          await writeAudit(tx, {
            userId: actor.id,
            action: 'EQUIPMENT_STATUS_CHANGE',
            entityType: 'Equipment',
            entityId: id,
            details: { from: equipment.operationalStatus, to: body.operationalStatus },
          });
          return updated;
        },
        { client: db },
      );
    },

    async listMaintenance(query: MaintenanceListQuery) {
      const pagination = parsePagination(query as Record<string, unknown>);
      const rows = await listMaintenanceRecords(db);
      const filtered = applyFilters(rows, [
        equals((r) => r.equipmentId, query.equipmentId),
        equals((r) => r.equipment.departmentId, query.departmentId),
        equals((r) => r.type, query.type),
        equals((r) => r.endDate === null, query.open),
        dateRange((r) => r.startDate, { from: query.from, to: query.to }),
      ]);
      return toPage(filtered.slice(pagination.skip, pagination.skip + pagination.take), filtered.length, pagination);
    },

    async open(actor: Actor, body: MaintenanceBody) {
      return withTransaction(
        async (tx) => {
          const equipment = await findEquipmentById(tx, body.equipmentId);
          const records = equipment === null ? [] : await listEquipmentMaintenance(tx, equipment.id);
          const state: MaintenanceState = {
            equipment: equipment === null ? [] : [toStatusLike(equipment)],
            records: records.map(toRecordLike),
          };
          const result = openMaintenance(state, { equipmentId: body.equipmentId, startDate: body.startDate }, now());
          if (!result.ok) throw result.error;
          if (equipment === null) throw new NotFoundError(EQUIPMENT_MESSAGES.notFound);

          const record = await createMaintenanceRecord(tx, {
            equipmentId: body.equipmentId,
            type: body.type,
            startDate: body.startDate,
            description: body.description,
            technician: body.technician,
          });
          await setEquipmentStatus(tx, body.equipmentId, 'en mantenimiento');
          await writeAudit(tx, {
            userId: actor.id,
            action: 'MAINTENANCE_OPEN',
            entityType: 'MaintenanceRecord',
            entityId: record.id,
            details: {
              equipmentId: body.equipmentId,
              type: body.type,
              from: equipment.operationalStatus,
              to: 'en mantenimiento',
            },
          });
          return record;
        },
        { client: db },
      );
    },

    async close(actor: Actor, id: number, body: CloseMaintenanceBody) {
      return withTransaction(
        async (tx) => {
          const record = await findMaintenanceRecord(tx, id);
          const equipment = record === null ? null : await findEquipmentById(tx, record.equipmentId);
          const state: MaintenanceState = {
            equipment: equipment === null ? [] : [toStatusLike(equipment)],
            records: record === null ? [] : [toRecordLike(record)],
          };
          const result = closeMaintenance(state, { recordId: id, endDate: body.endDate, resultingStatus: body.resultingStatus });
          if (!result.ok) throw result.error;
          if (record === null) throw new NotFoundError(MAINTENANCE_MESSAGES.recordNotFound);
          if (equipment === null) throw new NotFoundError(EQUIPMENT_MESSAGES.notFound);

          const closed = await closeMaintenanceRecord(tx, id, {
            endDate: body.endDate,
            resultingStatus: body.resultingStatus,
          });
          await setEquipmentStatus(tx, record.equipmentId, body.resultingStatus);
          await writeAudit(tx, {
            userId: actor.id,
            action: 'MAINTENANCE_CLOSE',
            entityType: 'MaintenanceRecord',
            entityId: id,
            details: {
              equipmentId: record.equipmentId,
              from: equipment.operationalStatus,
              to: body.resultingStatus,
            },
          });
          return closed;
        },
        { client: db },
      );
    },

    async equipmentMaintenance(id: number) {
      await requireEquipment(id);
      return { data: await listEquipmentMaintenance(db, id) };
    },
  };
}

export type EquipmentService = ReturnType<typeof createEquipmentService>;
