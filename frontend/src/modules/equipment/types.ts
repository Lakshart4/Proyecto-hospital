export const OPERATIONAL_STATUSES = ['disponible', 'en uso', 'en mantenimiento', 'fuera de servicio'] as const;
export const MAINTENANCE_TYPES = ['preventivo', 'correctivo', 'reparación'] as const;
export const MAINTENANCE_RESULT_STATUSES = ['disponible', 'fuera de servicio'] as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export type MaintenanceResultStatus = (typeof MAINTENANCE_RESULT_STATUSES)[number];

export interface Department {
  id: number;
  name: string;
}

export interface Equipment {
  id: number;
  name: string;
  category: string;
  departmentId: number;
  department: Department;
  quantity: number;
  location: string;
  operationalStatus: OperationalStatus;
  maintenanceRequired: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaintenanceEquipment {
  id: number;
  name: string;
  category: string;
  departmentId: number;
  department: Department;
}

export interface MaintenanceRecord {
  id: number;
  equipmentId: number;
  equipment: MaintenanceEquipment;
  type: MaintenanceType;
  startDate: string;
  endDate: string | null;
  description: string;
  technician: string;
  resultingStatus: MaintenanceResultStatus | null;
}

export interface EquipmentSummaryCell {
  category: string;
  departmentId: number;
  quantity: number;
}

export interface EquipmentSummary {
  cells: EquipmentSummaryCell[];
  byCategory: Array<{ category: string; quantity: number }>;
  byDepartment: Array<{ departmentId: number; quantity: number }>;
  total: number;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface EquipmentFilters {
  departmentId?: number;
  category?: string;
  status?: OperationalStatus;
  search?: string;
}

export interface MaintenanceFilters {
  equipmentId?: number;
  departmentId?: number;
  type?: MaintenanceType;
  open?: boolean;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}

export interface EquipmentPayload {
  name: string;
  category: string;
  departmentId: number;
  quantity: number;
  location: string;
  operationalStatus: OperationalStatus;
  maintenanceRequired: boolean;
}

export interface OpenMaintenancePayload {
  equipmentId: number;
  type: MaintenanceType;
  startDate: string;
  description: string;
  technician: string;
}

export interface CloseMaintenancePayload {
  endDate: string;
  resultingStatus: MaintenanceResultStatus;
}
