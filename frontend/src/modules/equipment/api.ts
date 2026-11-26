import { apiClient } from '../../shared/lib/apiClient';
import type {
  CloseMaintenancePayload,
  Department,
  Equipment,
  EquipmentFilters,
  EquipmentPayload,
  EquipmentSummary,
  MaintenanceFilters,
  MaintenanceRecord,
  OpenMaintenancePayload,
  OperationalStatus,
  Paginated,
} from './types';

function queryString(values: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listDepartments(signal?: AbortSignal): Promise<Department[]> {
  const response = await apiClient.get<{ data: Department[] }>('/departments', signal ? { signal } : {});
  return response.data;
}

export async function listEquipment(filters: EquipmentFilters = {}, signal?: AbortSignal): Promise<Equipment[]> {
  const query = queryString({
    departmentId: filters.departmentId,
    category: filters.category?.trim() || undefined,
    status: filters.status,
    search: filters.search?.trim() || undefined,
  });
  const response = await apiClient.get<{ data: Equipment[] }>(`/equipment${query}`, signal ? { signal } : {});
  return response.data;
}

export async function getEquipment(id: number, signal?: AbortSignal): Promise<Equipment> {
  const response = await apiClient.get<{ data: Equipment }>(`/equipment/${id}`, signal ? { signal } : {});
  return response.data;
}

export async function createEquipment(payload: EquipmentPayload): Promise<Equipment> {
  const response = await apiClient.post<{ data: Equipment }>('/equipment', payload);
  return response.data;
}

export async function updateEquipment(id: number, payload: EquipmentPayload): Promise<Equipment> {
  const response = await apiClient.put<{ data: Equipment }>(`/equipment/${id}`, payload);
  return response.data;
}

export async function deleteEquipment(id: number): Promise<void> {
  await apiClient.delete(`/equipment/${id}`);
}

export async function changeEquipmentStatus(id: number, operationalStatus: OperationalStatus): Promise<Equipment> {
  const response = await apiClient.patch<{ data: Equipment }>(`/equipment/${id}/status`, { operationalStatus });
  return response.data;
}

export async function getEquipmentSummary(signal?: AbortSignal): Promise<EquipmentSummary> {
  const response = await apiClient.get<{ data: EquipmentSummary }>('/equipment/summary', signal ? { signal } : {});
  return response.data;
}

export async function listMaintenance(filters: MaintenanceFilters, signal?: AbortSignal): Promise<Paginated<MaintenanceRecord>> {
  const query = queryString({
    equipmentId: filters.equipmentId,
    departmentId: filters.departmentId,
    type: filters.type,
    open: filters.open,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    pageSize: filters.pageSize,
  });
  return apiClient.get<Paginated<MaintenanceRecord>>(`/maintenance${query}`, signal ? { signal } : {});
}

export async function getEquipmentMaintenance(id: number, signal?: AbortSignal): Promise<MaintenanceRecord[]> {
  const response = await apiClient.get<{ data: MaintenanceRecord[] }>(`/equipment/${id}/maintenance`, signal ? { signal } : {});
  return response.data;
}

export async function openMaintenance(payload: OpenMaintenancePayload): Promise<MaintenanceRecord> {
  const response = await apiClient.post<{ data: MaintenanceRecord }>('/maintenance', payload);
  return response.data;
}

export async function closeMaintenance(id: number, payload: CloseMaintenancePayload): Promise<MaintenanceRecord> {
  const response = await apiClient.post<{ data: MaintenanceRecord }>(`/maintenance/${id}/close`, payload);
  return response.data;
}
