// Servicio de Pacientes, movimientos, observaciones y Tratamientos_Programados (Req. 6, 20, 21, 12.2).

import type { PatientStatus, TreatmentStatus } from '../domain/constants';
import { applyFilters, equals } from '../domain/filters';
import { parsePagination, toPage } from '../domain/others';
import { nextPatientStatus, searchPatients, validDeathTime } from '../domain/patients';
import { canAccessPatient, canUpdatePatientField, validateResponsibles } from '../domain/permissions';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError, type FieldError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  closeActiveRoomAssignment,
  countPatientTreatments,
  createPatient,
  createPatientMovement,
  createTreatment,
  deletePatient,
  findPatientById,
  findTreatmentById,
  listPatientMovements,
  listPatients,
  listPatientTreatments,
  listUsersForResponsibleValidation,
  readmitPatient,
  updateMedicalObservation,
  updateNursingObservation,
  updatePatient,
  updatePatientStatus,
  updateTreatment,
  updateTreatmentStatus,
} from '../repositories/patients.repository';
import { departmentExists } from '../repositories/staff.repository';
import { withTransaction, type DbClient } from '../repositories/transaction';
import { createRoomsService } from './rooms.service';
import type {
  ObservationBody,
  PatientBody,
  PatientListQuery,
  PatientStatusBody,
  ReadmissionBody,
  TreatmentBody,
  TreatmentListQuery,
  TreatmentStatusBody,
} from '../schemas/patients';
import type { Actor } from './staff.service';

export const MAX_TREATMENTS_PER_PATIENT = 100;

export const PATIENT_MESSAGES = {
  notFound: 'El paciente no existe.',
  treatmentNotFound: 'El tratamiento no existe.',
  department: 'El departamento indicado no existe.',
  admissionInFuture: 'La fecha de ingreso no puede ser posterior a hoy.',
  deceasedTimeInvalid: 'La fecha y hora de fallecimiento debe estar entre el último ingreso y el momento actual.',
  statusConflict: 'No es posible cambiar el estado del paciente desde su estado actual.',
  deceasedImmutable: 'Un paciente fallecido no puede cambiar de estado ni reingresarse.',
  nonActiveConflict: 'No se puede modificar información clínica de un paciente que no está activo.',
  maxTreatments: `El paciente alcanzó el máximo de ${MAX_TREATMENTS_PER_PATIENT} tratamientos registrados.`,
  treatmentNotScheduled: 'Solo se puede cambiar el estado de un tratamiento programado.',
} as const;

export interface PatientsServiceOptions {
  db: Database;
  now?: () => Date;
}

export function createPatientsService(options: PatientsServiceOptions) {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  const requirePatient = async (id: number, client: Database | DbClient = db) => {
    const patient = await findPatientById(client, id);
    if (patient === null) throw new NotFoundError(PATIENT_MESSAGES.notFound);
    return patient;
  };

  const requireAccessiblePatient = async (actor: Actor, id: number, client: Database | DbClient = db) => {
    const patient = await requirePatient(id, client);
    if (!canAccessPatient(actor, patient)) throw new ForbiddenError();
    return patient;
  };

  const validatePatientInputs = async (
    departmentId: number,
    doctorId: number,
    nurseId: number,
    admissionDate: Date,
  ) => {
    const currentNow = now();
    const errors: FieldError[] = [];
    if (admissionDate.getTime() > currentNow.getTime()) {
      errors.push({ field: 'admissionDate', message: PATIENT_MESSAGES.admissionInFuture });
    }
    if (!(await departmentExists(db, departmentId))) {
      errors.push({ field: 'departmentId', message: PATIENT_MESSAGES.department });
    }
    const users = await listUsersForResponsibleValidation(db, [doctorId, nurseId]);
    errors.push(...validateResponsibles(users, { doctorId, nurseId }));
    if (errors.length > 0) {
      throw new ValidationError('Los datos enviados no son válidos.', errors);
    }
  };

  const assertFieldEditableByActor = (
    actor: Actor,
    patient: { status: string; doctorId: number; nurseId: number },
    field: 'medicalObservation' | 'nursingObservation' | 'treatment',
    treatmentTransition?: { action: 'create' | 'edit' | 'cancel' } | { action: 'markDone'; from: TreatmentStatus },
  ) => {
    if (actor.role === 'ADMIN') return;
    const isResponsible = field === 'nursingObservation' || (field === 'treatment' && actor.role === 'NURSE')
      ? patient.nurseId === actor.id
      : patient.doctorId === actor.id;
    const decision = canUpdatePatientField({
      role: actor.role,
      isResponsible,
      patientStatus: patient.status as PatientStatus,
      field,
      ...(treatmentTransition ? { treatmentTransition } : {}),
    });
    if (decision === 'FORBIDDEN') throw new ForbiddenError();
    if (decision === 'CONFLICT') throw new ConflictError(PATIENT_MESSAGES.nonActiveConflict);
  };

  return {
    // Se expone aquí para que el router clínico ya montado pueda componer también las rutas de
    // Habitaciones con el mismo cliente y reloj, sin duplicar conexiones ni alterar el cableado global.
    rooms: createRoomsService({ db, now }),

    async list(actor: Actor, query: PatientListQuery) {
      const pagination = parsePagination(query as Record<string, unknown>);
      const all = await listPatients(db);
      const scoped = all.filter((p) => canAccessPatient(actor, p));
      const filtered = applyFilters(scoped, [
        equals((p) => p.status, query.status),
        equals((p) => p.departmentId, query.departmentId),
      ]);
      const searched = searchPatients(filtered, query.search);
      const pageItems = searched.slice(pagination.skip, pagination.skip + pagination.take);
      return toPage(pageItems, searched.length, pagination);
    },

    async counts(actor: Actor) {
      const all = await listPatients(db);
      const scoped = all.filter((p) => canAccessPatient(actor, p));
      let activo = 0;
      let discharged = 0;
      let deceased = 0;
      for (const p of scoped) {
        if (p.status === 'activo') activo += 1;
        else if (p.status === 'dado de alta') discharged += 1;
        else if (p.status === 'fallecido') deceased += 1;
      }
      return {
        activo,
        'dado de alta': discharged,
        fallecido: deceased,
        total: scoped.length,
      };
    },

    async get(actor: Actor, id: number) {
      return requireAccessiblePatient(actor, id);
    },

    async create(actor: Actor, body: PatientBody) {
      await validatePatientInputs(body.departmentId, body.doctorId, body.nurseId, body.admissionDate);
      return withTransaction(
        async (tx) => {
          const patient = await createPatient(tx, {
            internalId: body.internalId,
            firstName: body.firstName,
            lastName: body.lastName,
            birthDate: body.birthDate,
            sex: body.sex,
            phone: body.phone ?? null,
            admissionDate: body.admissionDate,
            reason: body.reason,
            departmentId: body.departmentId,
            doctorId: body.doctorId,
            nurseId: body.nurseId,
          });
          await createPatientMovement(tx, {
            patientId: patient.id,
            type: 'ingreso',
            occurredAt: body.admissionDate,
            departmentId: body.departmentId,
            userId: actor.id,
            note: body.reason,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'PATIENT_ADMISSION',
            entityType: 'Patient',
            entityId: patient.id,
            details: { departmentId: body.departmentId },
          });
          return patient;
        },
        { client: db },
      );
    },

    async update(id: number, body: PatientBody) {
      await requirePatient(id);
      await validatePatientInputs(body.departmentId, body.doctorId, body.nurseId, body.admissionDate);
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          if (patient.status === 'fallecido' && patient.deceasedAt !== null && !validDeathTime(patient.deceasedAt, body.admissionDate, now())) {
            throw new ValidationError('Los datos enviados no son válidos.', [
              { field: 'admissionDate', message: PATIENT_MESSAGES.deceasedTimeInvalid },
            ]);
          }
          return updatePatient(tx, id, {
            internalId: body.internalId,
            firstName: body.firstName,
            lastName: body.lastName,
            birthDate: body.birthDate,
            sex: body.sex,
            phone: body.phone ?? null,
            admissionDate: body.admissionDate,
            reason: body.reason,
            departmentId: body.departmentId,
            doctorId: body.doctorId,
            nurseId: body.nurseId,
          });
        },
        { client: db },
      );
    },

    async changeStatus(actor: Actor, id: number, body: PatientStatusBody) {
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          if (patient.status === 'fallecido') throw new ConflictError(PATIENT_MESSAGES.deceasedImmutable);
          const action = body.status === 'fallecido' ? 'fallecimiento' : 'alta';
          const next = nextPatientStatus(patient.status as PatientStatus, action);
          if (next === 'CONFLICT') throw new ConflictError(PATIENT_MESSAGES.statusConflict);

          const currentNow = now();
          if (body.status === 'dado de alta' && body.deceasedAt !== null) {
            throw new ValidationError('Los datos enviados no son válidos.', [
              { field: 'deceasedAt', message: 'La fecha de fallecimiento solo puede indicarse al registrar un fallecimiento.' },
            ]);
          }
          const eventTime = body.status === 'fallecido' ? (body.deceasedAt ?? currentNow) : currentNow;
          if (body.status === 'fallecido' && !validDeathTime(eventTime, patient.admissionDate, currentNow)) {
            throw new ValidationError('Los datos enviados no son válidos.', [
              { field: 'deceasedAt', message: PATIENT_MESSAGES.deceasedTimeInvalid },
            ]);
          }

          await closeActiveRoomAssignment(tx, id, { endedAt: eventTime, releaseReason: action });
          const updated = await updatePatientStatus(tx, id, {
            status: next,
            deceasedAt: next === 'fallecido' ? eventTime : null,
          });
          await createPatientMovement(tx, {
            patientId: id,
            type: action,
            occurredAt: eventTime,
            departmentId: patient.departmentId,
            userId: actor.id,
            note: body.note,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'PATIENT_STATUS_CHANGE',
            entityType: 'Patient',
            entityId: id,
            details: { from: patient.status, to: next },
          });
          return updated;
        },
        { client: db },
      );
    },

    async readmit(actor: Actor, id: number, body: ReadmissionBody) {
      const currentNow = now();
      const errors: FieldError[] = [];
      if (body.admissionDate.getTime() > currentNow.getTime()) {
        errors.push({ field: 'admissionDate', message: PATIENT_MESSAGES.admissionInFuture });
      }
      if (!(await departmentExists(db, body.departmentId))) {
        errors.push({ field: 'departmentId', message: PATIENT_MESSAGES.department });
      }
      if (errors.length > 0) throw new ValidationError('Los datos enviados no son válidos.', errors);

      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          if (patient.status === 'fallecido') throw new ConflictError(PATIENT_MESSAGES.deceasedImmutable);
          const next = nextPatientStatus(patient.status as PatientStatus, 'reingreso');
          if (next === 'CONFLICT') throw new ConflictError(PATIENT_MESSAGES.statusConflict);

          const updated = await readmitPatient(tx, id, {
            admissionDate: body.admissionDate,
            departmentId: body.departmentId,
            reason: body.reason,
          });
          await createPatientMovement(tx, {
            patientId: id,
            type: 'ingreso',
            occurredAt: body.admissionDate,
            departmentId: body.departmentId,
            userId: actor.id,
            note: body.reason,
          });
          await writeAudit(tx, {
            userId: actor.id,
            action: 'PATIENT_READMISSION',
            entityType: 'Patient',
            entityId: id,
            details: { departmentId: body.departmentId },
          });
          return updated;
        },
        { client: db },
      );
    },

    async setMedicalObservation(actor: Actor, id: number, body: ObservationBody) {
      const at = now();
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          assertFieldEditableByActor(actor, patient, 'medicalObservation');
          return updateMedicalObservation(tx, id, { text: body.text, at, byId: actor.id });
        },
        { client: db },
      );
    },

    async setNursingObservation(actor: Actor, id: number, body: ObservationBody) {
      const at = now();
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          assertFieldEditableByActor(actor, patient, 'nursingObservation');
          return updateNursingObservation(tx, id, { text: body.text, at, byId: actor.id });
        },
        { client: db },
      );
    },

    async movements(actor: Actor, id: number) {
      await requireAccessiblePatient(actor, id);
      return listPatientMovements(db, id);
    },

    async listTreatments(actor: Actor, id: number, query: TreatmentListQuery) {
      await requireAccessiblePatient(actor, id);
      const rows = await listPatientTreatments(db, id);
      return applyFilters(rows, [
        equals((t) => t.type, query.type),
        equals((t) => t.status, query.status),
      ]);
    },

    async createTreatment(actor: Actor, id: number, body: TreatmentBody) {
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          assertFieldEditableByActor(actor, patient, 'treatment', { action: 'create' });
          const currentCount = await countPatientTreatments(tx, id);
          if (currentCount >= MAX_TREATMENTS_PER_PATIENT) {
            throw new ConflictError(PATIENT_MESSAGES.maxTreatments);
          }
          return createTreatment(tx, {
            patientId: id,
            type: body.type,
            scheduledAt: body.scheduledAt,
            description: body.description,
            createdById: actor.id,
          });
        },
        { client: db },
      );
    },

    async updateTreatment(actor: Actor, id: number, tid: number, body: TreatmentBody) {
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          assertFieldEditableByActor(actor, patient, 'treatment', { action: 'edit' });
          const treatment = await findTreatmentById(tx, id, tid);
          if (treatment === null) throw new NotFoundError(PATIENT_MESSAGES.treatmentNotFound);
          return updateTreatment(tx, tid, {
            type: body.type,
            scheduledAt: body.scheduledAt,
            description: body.description,
          });
        },
        { client: db },
      );
    },

    async changeTreatmentStatus(actor: Actor, id: number, tid: number, body: TreatmentStatusBody) {
      return withTransaction(
        async (tx) => {
          const patient = await requirePatient(id, tx);
          // El alcance se comprueba antes de buscar el tratamiento para no filtrar su existencia.
          if (!canAccessPatient(actor, patient)) throw new ForbiddenError();
          if (body.status === 'cancelado') {
            assertFieldEditableByActor(actor, patient, 'treatment', { action: 'cancel' });
          }
          const treatment = await findTreatmentById(tx, id, tid);
          if (treatment === null) throw new NotFoundError(PATIENT_MESSAGES.treatmentNotFound);
          if (treatment.status !== 'programado') {
            throw new ConflictError(PATIENT_MESSAGES.treatmentNotScheduled);
          }
          if (body.status === 'realizado') {
            assertFieldEditableByActor(actor, patient, 'treatment', { action: 'markDone', from: 'programado' });
          }
          const performedAt = body.status === 'realizado' ? now() : null;
          return updateTreatmentStatus(tx, tid, { status: body.status, performedAt });
        },
        { client: db },
      );
    },

    async remove(id: number) {
      await requirePatient(id);
      await withTransaction((tx) => deletePatient(tx, id), { client: db });
    },
  };
}

export type PatientsService = ReturnType<typeof createPatientsService>;
