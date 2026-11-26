// Acceso a datos de Pacientes, movimientos y Tratamientos_Programados (Req. 6, 20, 21).

import type { PatientStatus, Role } from '../domain/constants';
import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

const PATIENT_SELECT = {
  id: true,
  internalId: true,
  firstName: true,
  lastName: true,
  birthDate: true,
  sex: true,
  phone: true,
  admissionDate: true,
  reason: true,
  status: true,
  deceasedAt: true,
  departmentId: true,
  department: { select: { id: true, name: true } },
  doctorId: true,
  doctor: { select: { id: true, name: true, internalId: true } },
  nurseId: true,
  nurse: { select: { id: true, name: true, internalId: true } },
  medicalObservation: true,
  medicalObservationAt: true,
  medicalObservationById: true,
  medicalObservationBy: { select: { id: true, name: true } },
  nursingObservation: true,
  nursingObservationAt: true,
  nursingObservationById: true,
  nursingObservationBy: { select: { id: true, name: true } },
  createdAt: true,
  updatedAt: true,
} as const;

export type PatientRecord = Awaited<ReturnType<typeof findPatientById>> & object;

export async function listPatients(db: Client) {
  return db.patient.findMany({
    select: PATIENT_SELECT,
    orderBy: [{ admissionDate: 'desc' }, { id: 'desc' }],
  });
}

export async function findPatientById(db: Client, id: number) {
  return db.patient.findUnique({ where: { id }, select: PATIENT_SELECT });
}

export async function listUsersForResponsibleValidation(db: Client, ids: number[]): Promise<{ id: number; role: Role }[]> {
  const rows = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } });
  return rows.map((r) => ({ id: r.id, role: r.role as Role }));
}

export interface PatientCreateData {
  internalId: string;
  firstName: string;
  lastName: string;
  birthDate: Date;
  sex: string;
  phone: string | null;
  admissionDate: Date;
  reason: string;
  departmentId: number;
  doctorId: number;
  nurseId: number;
}

export async function createPatient(tx: DbClient, data: PatientCreateData) {
  return runWithDbErrors({ operation: 'create', referenceField: 'departmentId' }, () =>
    tx.patient.create({
      data: { ...data, status: 'activo' },
      select: PATIENT_SELECT,
    }),
  );
}

export async function updatePatient(tx: DbClient, id: number, data: PatientCreateData) {
  return runWithDbErrors({ operation: 'update', referenceField: 'departmentId' }, () =>
    tx.patient.update({ where: { id }, data, select: PATIENT_SELECT }),
  );
}

export async function updatePatientStatus(tx: DbClient, id: number, data: { status: PatientStatus; deceasedAt: Date | null }) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.patient.update({ where: { id }, data, select: PATIENT_SELECT }),
  );
}

export async function readmitPatient(
  tx: DbClient,
  id: number,
  data: { admissionDate: Date; departmentId: number; reason: string },
) {
  return runWithDbErrors({ operation: 'update', referenceField: 'departmentId' }, () =>
    tx.patient.update({
      where: { id },
      data: { ...data, status: 'activo', deceasedAt: null },
      select: PATIENT_SELECT,
    }),
  );
}

export async function updateMedicalObservation(
  tx: DbClient,
  id: number,
  data: { text: string; at: Date; byId: number },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.patient.update({
      where: { id },
      data: {
        medicalObservation: data.text,
        medicalObservationAt: data.at,
        medicalObservationById: data.byId,
      },
      select: PATIENT_SELECT,
    }),
  );
}

export async function updateNursingObservation(
  tx: DbClient,
  id: number,
  data: { text: string; at: Date; byId: number },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.patient.update({
      where: { id },
      data: {
        nursingObservation: data.text,
        nursingObservationAt: data.at,
        nursingObservationById: data.byId,
      },
      select: PATIENT_SELECT,
    }),
  );
}

export async function closeActiveRoomAssignment(
  tx: DbClient,
  patientId: number,
  data: { endedAt: Date; releaseReason: 'alta' | 'fallecimiento' },
) {
  await tx.roomAssignment.updateMany({
    where: { patientId, endedAt: null },
    data: { endedAt: data.endedAt, releaseReason: data.releaseReason },
  });
}

export async function deletePatient(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.patient.delete({ where: { id } }));
}

export async function createPatientMovement(
  tx: DbClient,
  data: { patientId: number; type: string; occurredAt: Date; departmentId: number; userId: number; note: string },
) {
  return runWithDbErrors({ operation: 'create' }, () =>
    tx.patientMovement.create({
      data,
      select: {
        id: true,
        patientId: true,
        type: true,
        occurredAt: true,
        departmentId: true,
        department: { select: { id: true, name: true } },
        userId: true,
        user: { select: { id: true, name: true, role: true } },
        note: true,
      },
    }),
  );
}

export async function listPatientMovements(db: Client, patientId: number) {
  return db.patientMovement.findMany({
    where: { patientId },
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    select: {
      id: true,
      patientId: true,
      type: true,
      occurredAt: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      userId: true,
      user: { select: { id: true, name: true, role: true } },
      note: true,
    },
  });
}

// ---------- Tratamientos ----------

const TREATMENT_SELECT = {
  id: true,
  patientId: true,
  type: true,
  status: true,
  scheduledAt: true,
  performedAt: true,
  description: true,
  createdById: true,
  createdBy: { select: { id: true, name: true, role: true } },
} as const;

export async function listPatientTreatments(db: Client, patientId: number) {
  return db.treatment.findMany({
    where: { patientId },
    orderBy: [{ scheduledAt: 'desc' }, { id: 'desc' }],
    select: TREATMENT_SELECT,
  });
}

export async function countPatientTreatments(db: Client, patientId: number): Promise<number> {
  return db.treatment.count({ where: { patientId } });
}

export async function findTreatmentById(db: Client, patientId: number, tid: number) {
  return db.treatment.findFirst({ where: { id: tid, patientId }, select: TREATMENT_SELECT });
}

export async function createTreatment(
  tx: DbClient,
  data: { patientId: number; type: string; scheduledAt: Date; description: string; createdById: number },
) {
  return runWithDbErrors({ operation: 'create' }, () =>
    tx.treatment.create({
      data: { ...data, status: 'programado' },
      select: TREATMENT_SELECT,
    }),
  );
}

export async function updateTreatment(
  tx: DbClient,
  tid: number,
  data: { type: string; scheduledAt: Date; description: string },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.treatment.update({ where: { id: tid }, data, select: TREATMENT_SELECT }),
  );
}

export async function updateTreatmentStatus(
  tx: DbClient,
  tid: number,
  data: { status: 'realizado' | 'cancelado'; performedAt: Date | null },
) {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.treatment.update({ where: { id: tid }, data, select: TREATMENT_SELECT }),
  );
}
