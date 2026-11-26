import type { Page, PatientStatus } from '../patients/types';

export type RoomAvailability = 'disponible' | 'ocupada';
export type ReleaseReason = 'alta' | 'fallecimiento';

export interface RoomDepartment {
  id: number;
  name: string;
}

export interface RoomPatient {
  assignmentId: number;
  patientId: number;
  internalId: string;
  firstName: string;
  lastName: string;
  status: PatientStatus;
  startedAt: string;
}

export interface Room {
  id: number;
  number: number;
  departmentId: number;
  department: RoomDepartment;
  capacity: number;
  activeCount: number;
  availability: RoomAvailability;
  patients: RoomPatient[];
}

export interface OccupancyCount {
  occupied: number;
  available: number;
  total: number;
}

export interface DepartmentOccupancyCount extends OccupancyCount {
  departmentId: number;
  departmentName: string;
}

export interface RoomCounters {
  total: OccupancyCount;
  byDepartment: DepartmentOccupancyCount[];
}

export interface RoomFilters {
  departmentId?: number;
  availability?: RoomAvailability | '';
}

export interface OccupancyAssignment {
  id: number;
  roomId: number;
  patientId: number;
  startedAt: string;
  endedAt: string | null;
  releaseReason: ReleaseReason | null;
  room: {
    id: number;
    number: number;
    departmentId: number;
    department: RoomDepartment;
  };
  patient: {
    id: number;
    internalId: string;
    firstName: string;
    lastName: string;
    status: PatientStatus;
  };
  departmentId: number;
  departmentName: string;
}

export type OccupancyPage = Page<OccupancyAssignment>;

export interface OccupancyFilters {
  departmentId?: number;
  roomId?: number;
  reason?: ReleaseReason | '';
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export interface OccupancySummary {
  departmentId: number;
  departmentName: string;
  started: number;
  active: number;
  releasedByDischarge: number;
  releasedByDeath: number;
}
