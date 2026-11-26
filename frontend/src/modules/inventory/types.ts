export type ProductCategory = 'insumo médico' | 'medicamento' | 'material de limpieza';
export type MedicalProductCategory = Exclude<ProductCategory, 'material de limpieza'>;
export type SupplySubcategory = 'jeringa' | 'sonda' | 'catéter' | 'suero' | 'instrumental' | 'material médico';
export type MedicationType = 'genérico' | 'de patente';
export type ControlClass = 'venta libre' | 'receta simple' | 'receta retenida' | 'controlado' | 'uso hospitalario';
export type MovementType = 'entrada' | 'salida' | 'ajuste';

export interface SupplierReference {
  id: number;
  name: string;
  contact?: string;
}

export interface MedicationInfo {
  type: MedicationType;
  activeIngredient: string;
  tradeName: string | null;
  controlClass: ControlClass;
  requiresPrescription: boolean;
}

export interface Product {
  id: number;
  name: string;
  category: ProductCategory;
  classification: string;
  quantity: number;
  minStock: number;
  supplierId: number;
  supplier: SupplierReference | null;
  lowStock: boolean;
  availability: string;
  medicationInfo: MedicationInfo | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface InventoryMovement {
  id: number;
  productId: number;
  type: MovementType;
  quantityBefore: number;
  quantityAfter: number;
  reason: string;
  userId: number;
  user?: { id: number; name: string } | null;
  product?: Pick<Product, 'id' | 'name' | 'category'> | null;
  deliveryId?: number | null;
  createdAt: string;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProductFilters {
  category?: MedicalProductCategory | '';
  subcategory?: SupplySubcategory | '';
  availability?: string;
  lowStock?: '' | 'true' | 'false';
  supplierId?: number | '';
  medicationType?: MedicationType | '';
  controlClass?: ControlClass | '';
  requiresPrescription?: '' | 'true' | 'false';
  controlled?: '' | 'true' | 'false';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CleaningProductFilters {
  availability?: string;
  lowStock?: '' | 'true' | 'false';
  supplierId?: number | '';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface MovementFilters {
  productId?: number | '';
  category?: ProductCategory | '';
  type?: MovementType | '';
  userId?: number | '';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface MedicationPayload {
  type: MedicationType;
  activeIngredient: string;
  tradeName?: string;
  controlClass: ControlClass;
  requiresPrescription: boolean;
}

export interface ProductPayload {
  name: string;
  category: ProductCategory;
  classification: string;
  quantity: number;
  minStock: number;
  supplierId: number;
  medicationInfo?: MedicationPayload;
}

export interface MovementPayload {
  type: MovementType;
  quantity: number;
  reason: string;
}
