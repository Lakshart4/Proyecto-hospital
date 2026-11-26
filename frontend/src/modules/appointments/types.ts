import type { Page, Patient, StaffOption } from '../patients/types';

export type AppointmentStatus = 'programada' | 'cancelada';
export interface Appointment {
  id: number;
  patientId: number;
  doctorId: number;
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
  notes: string;
  status: AppointmentStatus;
  cancelReason: string | null;
  canceledAt: string | null;
  createdById: number;
  createdAt: string;
  updatedAt: string;
  patient: Pick<Patient, 'id' | 'internalId' | 'firstName' | 'lastName' | 'status' | 'departmentId'>;
  doctor: Pick<StaffOption, 'id' | 'internalId' | 'name'> & { active: boolean };
}
export interface AppointmentPayload {
  patientId: number;
  doctorId: number;
  scheduledAt: string;
  durationMinutes: number;
  reason: string;
  notes: string;
}
export interface AppointmentFilters {
  patientId?: number;
  doctorId?: number;
  status?: AppointmentStatus | '';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}
export type AppointmentPage = Page<Appointment>;
