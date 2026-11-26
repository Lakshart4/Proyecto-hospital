import { apiClient, DASHBOARD_TIMEOUT_MS } from '../../shared/lib/apiClient';
import type { DashboardData, UpcomingEvent } from './types';

type DashboardResponse = {
  data: Omit<DashboardData, 'upcoming'> & { upcoming?: UpcomingEvent[] };
  upcoming?: UpcomingEvent[];
};

/** Carga el panel completo con el límite de 10 segundos exigido por la API. */
export async function getDashboard(signal?: AbortSignal): Promise<DashboardData> {
  const response = await apiClient.get<DashboardResponse>('/dashboard', {
    timeoutMs: DASHBOARD_TIMEOUT_MS,
    ...(signal ? { signal } : {}),
  });
  return {
    ...response.data,
    upcoming: response.data.upcoming ?? response.upcoming ?? [],
  };
}
