import { apiClient } from '../../shared/lib/apiClient';
import type { AuditFilters, AuditPage } from './types';

export async function listAudit(filters: AuditFilters, signal?: AbortSignal): Promise<AuditPage> {
  const params = new URLSearchParams();
  if (filters.userId !== undefined) params.set('userId', String(filters.userId));
  if (filters.action) params.set('action', filters.action);
  if (filters.from) params.set('from', filters.from);
  if (filters.to) params.set('to', filters.to);
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  return apiClient.get<AuditPage>(`/audit?${params.toString()}`, signal ? { signal } : {});
}
