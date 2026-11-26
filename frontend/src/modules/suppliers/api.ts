import { apiClient } from '../../shared/lib/apiClient';
import type {
  DeliveryFilters,
  DeliveryPage,
  DeliveryPayload,
  ReceiveDeliveryPayload,
  Supplier,
  SupplierDelivery,
  SupplierPayload,
} from './types';

function queryString(values: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listSuppliers(signal?: AbortSignal): Promise<Supplier[]> {
  const response = await apiClient.get<{ data: Supplier[] }>('/suppliers', signal ? { signal } : {});
  return response.data;
}

export async function getSupplier(id: number, signal?: AbortSignal): Promise<Supplier> {
  const response = await apiClient.get<{ data: Supplier }>(`/suppliers/${id}`, signal ? { signal } : {});
  return response.data;
}

export async function createSupplier(payload: SupplierPayload): Promise<Supplier> {
  const response = await apiClient.post<{ data: Supplier }>('/suppliers', payload);
  return response.data;
}

export async function updateSupplier(id: number, payload: SupplierPayload): Promise<Supplier> {
  const response = await apiClient.put<{ data: Supplier }>(`/suppliers/${id}`, payload);
  return response.data;
}

export async function deleteSupplier(id: number): Promise<void> {
  await apiClient.delete(`/suppliers/${id}`);
}

export async function listDeliveries(filters: DeliveryFilters = {}, signal?: AbortSignal): Promise<DeliveryPage> {
  const response = await apiClient.get<DeliveryPage>(`/deliveries${queryString(filters)}`, signal ? { signal } : {});
  return response;
}

export async function getDelivery(id: number, signal?: AbortSignal): Promise<SupplierDelivery> {
  const response = await apiClient.get<{ data: SupplierDelivery }>(`/deliveries/${id}`, signal ? { signal } : {});
  return response.data;
}

export async function createDelivery(payload: DeliveryPayload): Promise<SupplierDelivery> {
  const response = await apiClient.post<{ data: SupplierDelivery }>('/deliveries', payload);
  return response.data;
}

export async function updateDelivery(id: number, payload: DeliveryPayload): Promise<SupplierDelivery> {
  const response = await apiClient.put<{ data: SupplierDelivery }>(`/deliveries/${id}`, payload);
  return response.data;
}

export async function receiveDelivery(id: number, payload: ReceiveDeliveryPayload): Promise<SupplierDelivery> {
  const response = await apiClient.post<{ data: SupplierDelivery }>(`/deliveries/${id}/receive`, payload);
  return response.data;
}

export async function cancelDelivery(id: number): Promise<SupplierDelivery> {
  const response = await apiClient.post<{ data: SupplierDelivery }>(`/deliveries/${id}/cancel`);
  return response.data;
}
