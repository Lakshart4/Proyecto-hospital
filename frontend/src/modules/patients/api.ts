import { apiClient } from '../../shared/lib/apiClient';
import type {
  Department,
  Page,
  Patient,
  PatientCounts,
  PatientFilters,
  PatientMovement,
  PatientStatus,
  StaffOption,
  Treatment,
  TreatmentFilters,
  TreatmentStatus,
  TreatmentType,
} from './types';

export interface PatientPayload {
  internalId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: Patient['sex'];
  phone: string | null;
  admissionDate: string;
  reason: string;
  departmentId: number;
  doctorId: number;
  nurseId: number;
}

export interface PatientStatusPayload {
  status: 'dado de alta' | 'fallecido';
  deceasedAt?: string | null;
  note?: string;
}

export interface ReadmissionPayload {
  admissionDate: string;
  departmentId: number;
  reason: string;
}

export interface TreatmentPayload {
  type: TreatmentType;
  scheduledAt: string;
  description: string;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim() !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export async function listPatients(filters: PatientFilters = {}, signal?: AbortSignal): Promise<Page<Patient>> {
  const query = queryString({
    status: filters.status,
    departmentId: filters.departmentId,
    search: filters.search?.trim(),
    page: filters.page,
    pageSize: filters.pageSize,
  });
  return apiClient.get<Page<Patient>>(`/patients${query}`, signal ? { signal } : {});
}

export async function getPatientCounts(signal?: AbortSignal): Promise<PatientCounts> {
  const response = await apiClient.get<{ data: PatientCounts }>('/patients/counts', signal ? { signal } : {});
  return response.data;
}

export async function getPatient(id: number, signal?: AbortSignal): Promise<Patient> {
  const response = await apiClient.get<{ data: Patient }>(`/patients/${id}`, signal ? { signal } : {});
  return response.data;
}

export async function createPatient(payload: PatientPayload): Promise<Patient> {
  const response = await apiClient.post<{ data: Patient }>('/patients', payload);
  return response.data;
}

export async function updatePatient(id: number, payload: PatientPayload): Promise<Patient> {
  const response = await apiClient.put<{ data: Patient }>(`/patients/${id}`, payload);
  return response.data;
}

export async function deletePatient(id: number): Promise<void> {
  await apiClient.delete(`/patients/${id}`);
}

export async function changePatientStatus(id: number, payload: PatientStatusPayload): Promise<Patient> {
  const response = await apiClient.patch<{ data: Patient }>(`/patients/${id}/status`, payload);
  return response.data;
}

export async function readmitPatient(id: number, payload: ReadmissionPayload): Promise<Patient> {
  const response = await apiClient.post<{ data: Patient }>(`/patients/${id}/readmission`, payload);
  return response.data;
}

export async function updateMedicalObservation(id: number, text: string): Promise<Patient> {
  const response = await apiClient.patch<{ data: Patient }>(`/patients/${id}/medical-observation`, { text });
  return response.data;
}

export async function updateNursingObservation(id: number, text: string): Promise<Patient> {
  const response = await apiClient.patch<{ data: Patient }>(`/patients/${id}/nursing-observation`, { text });
  return response.data;
}

export async function listPatientMovements(id: number, signal?: AbortSignal): Promise<PatientMovement[]> {
  const response = await apiClient.get<{ data: PatientMovement[] }>(`/patients/${id}/movements`, signal ? { signal } : {});
  return response.data;
}

export async function listTreatments(id: number, filters: TreatmentFilters = {}, signal?: AbortSignal): Promise<Treatment[]> {
  const query = queryString({ type: filters.type || undefined, status: filters.status || undefined });
  const response = await apiClient.get<{ data: Treatment[] }>(`/patients/${id}/treatments${query}`, signal ? { signal } : {});
  return response.data;
}

export async function createTreatment(id: number, payload: TreatmentPayload): Promise<Treatment> {
  const response = await apiClient.post<{ data: Treatment }>(`/patients/${id}/treatments`, payload);
  return response.data;
}

export async function updateTreatment(id: number, treatmentId: number, payload: TreatmentPayload): Promise<Treatment> {
  const response = await apiClient.put<{ data: Treatment }>(`/patients/${id}/treatments/${treatmentId}`, payload);
  return response.data;
}

export async function changeTreatmentStatus(
  id: number,
  treatmentId: number,
  status: Extract<TreatmentStatus, 'realizado' | 'cancelado'>,
): Promise<Treatment> {
  const response = await apiClient.patch<{ data: Treatment }>(`/patients/${id}/treatments/${treatmentId}/status`, { status });
  return response.data;
}

export async function listPatientDepartments(signal?: AbortSignal): Promise<Department[]> {
  const response = await apiClient.get<{ data: Department[] }>('/departments', signal ? { signal } : {});
  return response.data;
}

export async function listResponsibleStaff(role: 'DOCTOR' | 'NURSE', signal?: AbortSignal): Promise<StaffOption[]> {
  const response = await apiClient.get<{ data: StaffOption[] }>(`/staff?role=${role}`, signal ? { signal } : {});
  return response.data;
}

/** Obtiene todos los Pacientes activos, también cuando ocupan más de una página. */
export async function listAllActivePatients(signal?: AbortSignal): Promise<Patient[]> {
  const pageSize = 100;
  const first = await listPatients({ status: 'activo' satisfies PatientStatus, page: 1, pageSize }, signal);
  if (first.total <= first.data.length) return first.data;
  const pages = Math.ceil(first.total / pageSize);
  const rest = await Promise.all(
    Array.from({ length: pages - 1 }, (_, index) => listPatients({ status: 'activo', page: index + 2, pageSize }, signal)),
  );
  return [first, ...rest].flatMap((page) => page.data);
}
