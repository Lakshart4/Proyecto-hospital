import { ApiError, apiClient } from '../../shared/lib/apiClient';
import { MESSAGES } from '../../shared/lib/messages';
import type { Department, EmployeeDocument, StaffFilters, StaffListItem, StaffProfile, WorkDay } from './types';

export interface StaffPayload {
  internalId: string;
  email: string;
  role: 'DOCTOR' | 'NURSE' | 'CLEANING';
  name: string;
  position: string;
  description: string;
  specialty: string;
  departmentId: number;
  yearsExperience: number;
  shift: 'matutino' | 'vespertino';
  phone: string;
  birthDate: string | null;
}

export async function listDepartments(signal?: AbortSignal): Promise<Department[]> {
  const res = await apiClient.get<{ data: Department[] }>('/departments', signal ? { signal } : {});
  return res.data;
}

export async function listStaff(filters: StaffFilters = {}, signal?: AbortSignal): Promise<StaffListItem[]> {
  const params = new URLSearchParams();
  if (filters.role) params.set('role', filters.role);
  if (filters.departmentId) params.set('departmentId', String(filters.departmentId));
  if (filters.shift) params.set('shift', filters.shift);
  if (filters.search && filters.search.trim() !== '') params.set('search', filters.search.trim());
  const qs = params.toString();
  const res = await apiClient.get<{ data: StaffListItem[] }>(`/staff${qs ? `?${qs}` : ''}`, signal ? { signal } : {});
  return res.data;
}

export async function getStaff(id: number, signal?: AbortSignal): Promise<StaffProfile> {
  const res = await apiClient.get<{ data: StaffProfile }>(`/staff/${id}`, signal ? { signal } : {});
  return res.data;
}

export async function createStaff(payload: StaffPayload): Promise<{ profile: StaffProfile; initialPassword: string }> {
  const res = await apiClient.post<{ data: StaffProfile; initialPassword: string }>('/staff', payload);
  return { profile: res.data, initialPassword: res.initialPassword };
}

export async function updateStaff(id: number, payload: StaffPayload): Promise<StaffProfile> {
  const res = await apiClient.put<{ data: StaffProfile }>(`/staff/${id}`, payload);
  return res.data;
}

export async function deleteStaff(id: number): Promise<void> {
  await apiClient.delete(`/staff/${id}`);
}

export async function patchOwnProfile(body: { phone?: string; photoUrl?: null }): Promise<StaffProfile> {
  const res = await apiClient.patch<{ data: StaffProfile }>('/staff/me', body);
  return res.data;
}

export async function replaceSchedule(id: number, days: WorkDay[]): Promise<WorkDay[]> {
  const res = await apiClient.put<{ data: WorkDay[] }>(`/staff/${id}/schedule`, { days });
  return res.data;
}

export async function uploadStaffPhoto(id: number, file: File): Promise<StaffProfile> {
  const form = new FormData();
  form.append('file', file);
  const res = await apiClient.post<{ data: StaffProfile }>(`/staff/${id}/photo`, form);
  return res.data;
}

// ---------- Documentos ----------

export async function listOwnDocuments(signal?: AbortSignal): Promise<EmployeeDocument[]> {
  const res = await apiClient.get<{ data: EmployeeDocument[] }>('/me/documents', signal ? { signal } : {});
  return res.data;
}

export async function listEmployeeDocuments(employeeId: number, signal?: AbortSignal): Promise<EmployeeDocument[]> {
  const res = await apiClient.get<{ data: EmployeeDocument[] }>(`/staff/${employeeId}/documents`, signal ? { signal } : {});
  return res.data;
}

export async function uploadEmployeeDocument(employeeId: number, form: FormData): Promise<EmployeeDocument> {
  const res = await apiClient.post<{ data: EmployeeDocument }>(`/staff/${employeeId}/documents`, form);
  return res.data;
}

export async function replaceEmployeeDocument(docId: number, form: FormData): Promise<EmployeeDocument> {
  const res = await apiClient.put<{ data: EmployeeDocument }>(`/documents/${docId}`, form);
  return res.data;
}

export async function deleteEmployeeDocument(docId: number): Promise<void> {
  await apiClient.delete(`/documents/${docId}`);
}

/** Descarga un PDF autenticado y dispara la descarga en el navegador. Lanza ApiError si falla (incluido 403 AA). */
export async function downloadPdf(path: string, filename: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { credentials: 'include' });
  } catch {
    throw new ApiError({ kind: 'network', status: 0, code: null, message: MESSAGES.api.network });
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
    const code = typeof parsed?.code === 'string' ? (parsed.code as ApiError['code']) : null;
    const message = typeof parsed?.message === 'string' ? parsed.message : MESSAGES.api.unexpected;
    throw new ApiError({ kind: 'http', status: response.status, code, message });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
