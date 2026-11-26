import type { Role } from '../../app/permissions';

export type PatientStatus = 'activo' | 'dado de alta' | 'fallecido';
export type PatientSex = 'F' | 'M' | 'X';
export type PatientMovementType = 'ingreso' | 'alta' | 'fallecimiento';
export type TreatmentType = 'tratamiento' | 'cirugía';
export type TreatmentStatus = 'programado' | 'realizado' | 'cancelado';

export interface Department {
  id: number;
  name: string;
}

export interface ResponsiblePerson {
  id: number;
  name: string;
  internalId: string;
}

export interface ObservationAuthor {
  id: number;
  name: string;
}

export interface Patient {
  id: number;
  internalId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: PatientSex;
  phone: string | null;
  admissionDate: string;
  reason: string;
  status: PatientStatus;
  deceasedAt: string | null;
  departmentId: number;
  department: Department;
  doctorId: number;
  doctor: ResponsiblePerson;
  nurseId: number;
  nurse: ResponsiblePerson;
  medicalObservation: string;
  medicalObservationAt: string | null;
  medicalObservationById: number | null;
  medicalObservationBy: ObservationAuthor | null;
  nursingObservation: string;
  nursingObservationAt: string | null;
  nursingObservationById: number | null;
  nursingObservationBy: ObservationAuthor | null;
  createdAt: string;
  updatedAt: string;
}

export interface PatientCounts {
  activo: number;
  'dado de alta': number;
  fallecido: number;
  total: number;
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PatientFilters {
  status?: PatientStatus;
  departmentId?: number;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface StaffOption {
  id: number;
  internalId: string;
  name: string;
  role: Exclude<Role, 'ADMIN'>;
}

export interface PatientMovement {
  id: number;
  patientId: number;
  type: PatientMovementType;
  occurredAt: string;
  departmentId: number;
  department: Department;
  userId: number;
  user: {
    id: number;
    name: string;
    role: Role;
  };
  note: string;
}

export interface Treatment {
  id: number;
  patientId: number;
  type: TreatmentType;
  status: TreatmentStatus;
  scheduledAt: string;
  performedAt: string | null;
  description: string;
  createdById: number;
  createdBy: {
    id: number;
    name: string;
    role: Role;
  };
}

export interface TreatmentFilters {
  type?: TreatmentType | '';
  status?: TreatmentStatus | '';
}
