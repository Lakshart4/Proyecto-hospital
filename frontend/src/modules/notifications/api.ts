import { apiClient } from '../../shared/lib/apiClient';

export interface HospitalNotification {
  id: string;
  kind: 'stock' | 'treatment' | 'equipment' | 'delivery';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  date: string;
  href: string;
}

export async function listNotifications(signal?: AbortSignal): Promise<HospitalNotification[]> {
  const response = await apiClient.get<{ data: HospitalNotification[] }>('/notifications', signal ? { signal } : {});
  return response.data;
}
