import { apiClient } from '../../shared/lib/apiClient';
import type {
  CleaningProductFilters,
  InventoryMovement,
  MedicationInfo,
  MovementFilters,
  MovementPayload,
  Paginated,
  Product,
  ProductFilters,
  ProductPayload,
  SupplierReference,
} from './types';

interface ProductResponse extends Omit<Product, 'medicationInfo' | 'lowStock' | 'availability'> {
  medicationInfo?: MedicationInfo | null;
  medication?: MedicationInfo | null;
  lowStock?: boolean;
  availability?: string;
}

function queryString(values: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function normalizeProduct(product: ProductResponse): Product {
  return {
    ...product,
    medicationInfo: product.medicationInfo ?? product.medication ?? null,
    lowStock: product.lowStock ?? product.quantity <= product.minStock,
    availability: product.availability ?? (product.quantity === 0 ? 'agotado' : 'disponible'),
  };
}

function normalizePage<T>(response: Paginated<T>): Paginated<T> {
  return { data: response.data, page: response.page, pageSize: response.pageSize, total: response.total };
}

export async function listProducts(filters: ProductFilters = {}, signal?: AbortSignal): Promise<Paginated<Product>> {
  const response = await apiClient.get<Paginated<ProductResponse>>(
    `/inventory/products${queryString(filters)}`,
    signal ? { signal } : {},
  );
  return { ...normalizePage(response), data: response.data.map(normalizeProduct) };
}

export async function listCleaningProducts(filters: CleaningProductFilters = {}, signal?: AbortSignal): Promise<Paginated<Product>> {
  const response = await apiClient.get<Paginated<ProductResponse>>(
    `/cleaning-inventory/products${queryString(filters)}`,
    signal ? { signal } : {},
  );
  return { ...normalizePage(response), data: response.data.map(normalizeProduct) };
}

export async function getProduct(id: number, signal?: AbortSignal): Promise<Product> {
  const response = await apiClient.get<{ data: ProductResponse }>(`/inventory/products/${id}`, signal ? { signal } : {});
  return normalizeProduct(response.data);
}

export async function getCleaningProduct(id: number, signal?: AbortSignal): Promise<Product> {
  const response = await apiClient.get<{ data: ProductResponse }>(`/cleaning-inventory/products/${id}`, signal ? { signal } : {});
  return normalizeProduct(response.data);
}

export async function createProduct(payload: ProductPayload): Promise<Product> {
  const response = await apiClient.post<{ data: ProductResponse }>('/inventory/products', payload);
  return normalizeProduct(response.data);
}

export async function createCleaningProduct(payload: ProductPayload): Promise<Product> {
  const response = await apiClient.post<{ data: ProductResponse }>('/cleaning-inventory/products', payload);
  return normalizeProduct(response.data);
}

export async function updateProduct(id: number, payload: ProductPayload): Promise<Product> {
  const response = await apiClient.put<{ data: ProductResponse }>(`/inventory/products/${id}`, payload);
  return normalizeProduct(response.data);
}

export async function updateCleaningProduct(id: number, payload: ProductPayload): Promise<Product> {
  const response = await apiClient.put<{ data: ProductResponse }>(`/cleaning-inventory/products/${id}`, payload);
  return normalizeProduct(response.data);
}

export async function deleteProduct(id: number): Promise<void> {
  await apiClient.delete(`/inventory/products/${id}`);
}

export async function deleteCleaningProduct(id: number): Promise<void> {
  await apiClient.delete(`/cleaning-inventory/products/${id}`);
}

export async function createMovement(productId: number, payload: MovementPayload): Promise<InventoryMovement> {
  const response = await apiClient.post<{ data: InventoryMovement }>(`/inventory/products/${productId}/movements`, payload);
  return response.data;
}

export async function createCleaningMovement(productId: number, payload: MovementPayload): Promise<InventoryMovement> {
  const response = await apiClient.post<{ data: InventoryMovement }>(`/cleaning-inventory/products/${productId}/movements`, payload);
  return response.data;
}

export async function listProductMovements(productId: number, signal?: AbortSignal): Promise<InventoryMovement[]> {
  const response = await apiClient.get<{ data: InventoryMovement[] } | Paginated<InventoryMovement>>(
    `/inventory/products/${productId}/movements`,
    signal ? { signal } : {},
  );
  return response.data;
}

export async function listMovements(filters: MovementFilters = {}, signal?: AbortSignal): Promise<Paginated<InventoryMovement>> {
  const response = await apiClient.get<Paginated<InventoryMovement>>(`/inventory/movements${queryString(filters)}`, signal ? { signal } : {});
  return normalizePage(response);
}

export async function listSupplierOptions(signal?: AbortSignal): Promise<SupplierReference[]> {
  const response = await apiClient.get<{ data: SupplierReference[] }>('/suppliers', signal ? { signal } : {});
  return response.data;
}
