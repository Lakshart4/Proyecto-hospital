import { apiClient } from '../../shared/lib/apiClient';
import type { ReportSummary } from './types';

export async function getReportSummary(from: string, to: string, signal?: AbortSignal): Promise<ReportSummary> {
  const params = new URLSearchParams({ from, to });
  const response = await apiClient.get<{ data: ReportSummary }>(`/reports/summary?${params}`, signal ? { signal } : {});
  return response.data;
}
