import { apiClient } from '../../shared/lib/apiClient';
import type { Appointment, AppointmentFilters, AppointmentPage, AppointmentPayload } from './types';

function queryString(filters: AppointmentFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listAppointments(filters: AppointmentFilters = {}, signal?: AbortSignal): Promise<AppointmentPage> {
  return apiClient.get<AppointmentPage>(`/appointments${queryString(filters)}`, signal ? { signal } : {});
}
export async function getAppointment(id: number, signal?: AbortSignal): Promise<Appointment> {
  const response = await apiClient.get<{ data: Appointment }>(`/appointments/${id}`, signal ? { signal } : {});
  return response.data;
}
export async function createAppointment(payload: AppointmentPayload): Promise<Appointment> {
  const response = await apiClient.post<{ data: Appointment }>('/appointments', payload);
  return response.data;
}
export async function updateAppointment(id: number, payload: AppointmentPayload): Promise<Appointment> {
  const response = await apiClient.put<{ data: Appointment }>(`/appointments/${id}`, payload);
  return response.data;
}
export async function cancelAppointment(id: number, reason: string): Promise<Appointment> {
  const response = await apiClient.patch<{ data: Appointment }>(`/appointments/${id}/cancel`, { reason });
  return response.data;
}
