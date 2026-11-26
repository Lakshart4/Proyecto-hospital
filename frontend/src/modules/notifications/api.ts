import { apiClient } from '../../shared/lib/apiClient';

export type NotificationKind = 'stock' | 'treatment' | 'equipment' | 'delivery' | 'appointment' | 'room';
export type NotificationSeverity = 'info' | 'warning' | 'critical';

export interface HospitalNotification {
  id: string;
  kind: NotificationKind;
  severity: NotificationSeverity;
  title: string;
  message: string;
  date: string;
  /** Solo está presente cuando el módulo de destino existe en el Frontend. */
  href?: string;
}

export async function listNotifications(signal?: AbortSignal): Promise<HospitalNotification[]> {
  const response = await apiClient.get<{ data: HospitalNotification[] }>('/notifications', signal ? { signal } : {});
  return response.data;
}
