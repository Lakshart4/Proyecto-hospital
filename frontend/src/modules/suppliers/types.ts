import type { Paginated, Product, SupplierReference } from '../inventory/types';

export type DeliveryStatus = 'programada' | 'recibida' | 'cancelada';

export interface SupplierDelivery {
  id: number;
  supplierId: number;
  productId: number;
  quantityRequested: number;
  scheduledDate: string;
  status: DeliveryStatus;
  receivedDate: string | null;
  quantityReceived: number | null;
  supplier?: SupplierReference | null;
  product?: Pick<Product, 'id' | 'name' | 'category' | 'quantity' | 'supplierId'> | null;
}

export interface Supplier {
  id: number;
  name: string;
  contact: string;
  products?: Product[];
  deliveries?: SupplierDelivery[];
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierPayload {
  name: string;
  contact: string;
}

export interface DeliveryPayload {
  supplierId: number;
  productId: number;
  quantityRequested: number;
  scheduledDate: string;
}

export interface ReceiveDeliveryPayload {
  receivedDate: string;
  quantityReceived: number;
}

export interface DeliveryFilters {
  supplierId?: number | '';
  productId?: number | '';
  status?: DeliveryStatus | '';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export type DeliveryPage = Paginated<SupplierDelivery>;
