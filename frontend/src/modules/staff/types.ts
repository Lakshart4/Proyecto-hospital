import type { Role } from '../../app/permissions';

export type EmployeeRole = Exclude<Role, 'ADMIN'>;
export type Shift = 'matutino' | 'vespertino';
export type DocumentType = 'contratación' | 'acreditación';

export interface Department {
  id: number;
  name: string;
}

export interface ScheduleBreak {
  startTime: string;
  endTime: string;
}

export interface WorkDay {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  mealStart: string | null;
  mealEnd: string | null;
  breaks: ScheduleBreak[];
}

export interface StaffListItem {
  id: number;
  internalId: string;
  email: string;
  role: EmployeeRole;
  active: boolean;
  name: string;
  photoUrl: string;
  position: string;
  description: string;
  specialty: string;
  departmentId: number;
  department: Department;
  yearsExperience: number;
  shift: Shift;
  phone: string;
  birthDate: string | null;
}

export interface StaffProfile extends Omit<StaffListItem, 'role'> {
  role: Role;
  schedule: WorkDay[];
}

export interface StaffFilters {
  role?: EmployeeRole | '';
  departmentId?: number | '';
  shift?: Shift | '';
  search?: string;
}

export interface EmployeeDocument {
  id: number;
  userId: number;
  type: DocumentType;
  title: string;
  issuedAt: string;
  expiresAt: string | null;
  fileSize: number;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
}
