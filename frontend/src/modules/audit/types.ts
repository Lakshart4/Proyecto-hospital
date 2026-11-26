export const AUDIT_ACTIONS = [
  'LOGIN_SUCCESS',
  'LOGIN_FAILURE',
  'PASSWORD_RESET_REQUEST',
  'PASSWORD_RESET_COMPLETE',
  'PASSWORD_CHANGE',
  'ADMIN_AUTH_GRANTED',
  'ADMIN_AUTH_REJECTED',
  'DOCUMENT_READ',
  'DOCUMENT_DOWNLOAD',
  'DOCUMENT_UPLOAD',
  'DOCUMENT_REPLACE',
  'DOCUMENT_DELETE',
  'PROFILE_DETAIL_READ',
  'EMPLOYEE_CREATE',
  'EMPLOYEE_DELETE',
  'EMPLOYEE_UPDATE',
  'ROLE_CHANGE',
  'PATIENT_STATUS_CHANGE',
  'PATIENT_ADMISSION',
  'PATIENT_READMISSION',
  'ROOM_ASSIGN',
  'ROOM_RELEASE',
  'INVENTORY_MOVEMENT',
  'DELIVERY_RECEIVE',
  'DELIVERY_CANCEL',
  'EQUIPMENT_STATUS_CHANGE',
  'MAINTENANCE_OPEN',
  'MAINTENANCE_CLOSE',
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditUser {
  id: number;
  name?: string;
  internalId?: string;
  email?: string;
}

export interface AuditLog {
  id: number;
  userId: number | null;
  user?: AuditUser | null;
  userName?: string | null;
  action: AuditAction | string;
  entityType: string;
  entityId: number | null;
  details: string | Record<string, unknown> | null;
  createdAt: string;
}

export interface AuditPage {
  data: AuditLog[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditFilters {
  userId?: number;
  action?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
}
