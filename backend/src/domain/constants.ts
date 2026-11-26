// Valores permitidos de los campos de texto con conjunto cerrado.
// En SQLite se guardan como String (no como enum de Prisma); estas listas son la
// única fuente de verdad y las usan los esquemas zod, los servicios y la semilla.

export const ROLES = ['ADMIN', 'DOCTOR', 'NURSE', 'CLEANING'] as const;
export type Role = (typeof ROLES)[number];

/** Roles que cuentan como Empleado (el Administrador no es Empleado). */
export const EMPLOYEE_ROLES = ['DOCTOR', 'NURSE', 'CLEANING'] as const satisfies readonly Role[];
export type EmployeeRole = (typeof EMPLOYEE_ROLES)[number];

export const SHIFTS = ['matutino', 'vespertino'] as const;
export type Shift = (typeof SHIFTS)[number];

export const INITIAL_DEPARTMENTS = [
  'Urgencias',
  'Cardiología',
  'Pediatría',
  'Cirugía',
  'Radiología',
  'Medicina Interna',
] as const;

export const DOCUMENT_TYPES = ['contratación', 'acreditación'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const PATIENT_STATUSES = ['activo', 'dado de alta', 'fallecido'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const PATIENT_SEXES = ['F', 'M', 'X'] as const;
export type PatientSex = (typeof PATIENT_SEXES)[number];

export const PATIENT_MOVEMENT_TYPES = ['ingreso', 'alta', 'fallecimiento'] as const;
export type PatientMovementType = (typeof PATIENT_MOVEMENT_TYPES)[number];

export const TREATMENT_TYPES = ['tratamiento', 'cirugía'] as const;
export type TreatmentType = (typeof TREATMENT_TYPES)[number];

export const TREATMENT_STATUSES = ['programado', 'realizado', 'cancelado'] as const;
export type TreatmentStatus = (typeof TREATMENT_STATUSES)[number];

export const APPOINTMENT_STATUSES = ['programada', 'cancelada'] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const RELEASE_REASONS = ['alta', 'fallecimiento'] as const;
export type ReleaseReason = (typeof RELEASE_REASONS)[number];

export const ROOM_AVAILABILITY = ['disponible', 'ocupada'] as const;
export type RoomAvailability = (typeof ROOM_AVAILABILITY)[number];

export const PRODUCT_CATEGORIES = ['insumo médico', 'medicamento', 'material de limpieza'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

/** Categorías del Módulo_Inventario (médico) y del Módulo_Inventario_Limpieza. */
export const MEDICAL_INVENTORY_CATEGORIES = ['insumo médico', 'medicamento'] as const satisfies readonly ProductCategory[];
export const CLEANING_INVENTORY_CATEGORIES = ['material de limpieza'] as const satisfies readonly ProductCategory[];

export const SUPPLY_SUBCATEGORIES = [
  'jeringa',
  'sonda',
  'catéter',
  'suero',
  'instrumental',
  'material médico',
] as const;
export type SupplySubcategory = (typeof SUPPLY_SUBCATEGORIES)[number];

export const PRODUCT_AVAILABILITY = ['disponible', 'agotado'] as const;
export type ProductAvailability = (typeof PRODUCT_AVAILABILITY)[number];

export const MEDICATION_TYPES = ['genérico', 'de patente'] as const;
export type MedicationType = (typeof MEDICATION_TYPES)[number];

export const CONTROL_CLASSES = [
  'venta libre',
  'receta simple',
  'receta retenida',
  'controlado',
  'uso hospitalario',
] as const;
export type ControlClass = (typeof CONTROL_CLASSES)[number];

export const DELIVERY_STATUSES = ['programada', 'recibida', 'cancelada'] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste'] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export const OPERATIONAL_STATUSES = ['disponible', 'en uso', 'en mantenimiento', 'fuera de servicio'] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const MAINTENANCE_TYPES = ['preventivo', 'correctivo', 'reparación'] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];

/** Estado_Operativo permitido al cerrar un Registro_de_Mantenimiento. */
export const MAINTENANCE_RESULT_STATUSES = ['disponible', 'fuera de servicio'] as const satisfies readonly OperationalStatus[];
export type MaintenanceResultStatus = (typeof MAINTENANCE_RESULT_STATUSES)[number];

/** Tipos de Evento que se guardan en la tabla Event. */
export const STORED_EVENT_TYPES = ['general', 'actividad', 'entrega', 'agenda individual'] as const;
export type StoredEventType = (typeof STORED_EVENT_TYPES)[number];

/** Todos los Tipos_de_Evento de los calendarios (los tres últimos son virtuales). */
export const EVENT_TYPES = [...STORED_EVENT_TYPES, 'cumpleaños', 'día inhábil', 'feriado'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Operaciones sensibles registradas en la Bitácora_de_Auditoría (Req. 12.2). */
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
  'SETTINGS_UPDATE',
  'APPOINTMENT_CREATE',
  'APPOINTMENT_UPDATE',
  'APPOINTMENT_CANCEL',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ENTITY_TYPES = [
  'User',
  'Session',
  'Employee',
  'EmployeeDocument',
  'Patient',
  'Room',
  'Product',
  'SupplierDelivery',
  'Equipment',
  'MaintenanceRecord',
  'InstitutionConfig',
  'Appointment',
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
