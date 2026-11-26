export interface DashboardCards {
  employees: number;
  activePatients: number;
  availableRooms: number;
  occupiedRooms: number;
  lowStockProducts: number;
  equipmentInMaintenance: number;
}

export interface DashboardIndicators {
  dischargedPatients: number;
  deceasedPatients: number;
  outOfServiceEquipment: number;
  outOfStockProducts: number;
}

export interface DepartmentOccupancy {
  departmentId: number;
  occupied: number;
  total: number;
  percentage: number;
  name?: string;
  departmentName?: string;
  department?: { id: number; name: string };
}

export interface UpcomingDelivery {
  status?: string;
  supplierName: string;
  productName: string;
  quantityRequested: number;
}

export interface UpcomingEvent {
  id: string | number;
  title: string;
  type: string;
  start?: string;
  startAt?: string;
  end?: string;
  endAt?: string;
  description?: string | null;
  color?: string;
  delivery?: UpcomingDelivery;
}

export interface DashboardData {
  cards: DashboardCards;
  indicators: DashboardIndicators;
  byDepartment: DepartmentOccupancy[];
  upcoming: UpcomingEvent[];
}
