// Datos demo ficticios de la semilla (Req. 14).
// Todos los nombres, correos (dominio reservado example.com), teléfonos y datos médicos son inventados.
// Las fechas se expresan como desplazamientos en días respecto a la fecha de referencia de la semilla.

import type {
  ControlClass,
  DeliveryStatus,
  DocumentType,
  MaintenanceType,
  MedicationType,
  OperationalStatus,
  PatientSex,
  PatientStatus,
  ProductCategory,
  Role,
  Shift,
  StoredEventType,
  TreatmentStatus,
  TreatmentType,
} from '../../src/domain/constants';

// ---------- Cuentas demo: 1 Administrador y 10 Empleados ----------

export interface SeedAccount {
  /** Variable de entorno con la contraseña opcional de esta cuenta. */
  variable: string;
  internalId: string;
  email: string;
  role: Role;
  name: string;
  position: string;
  description: string;
  specialty: string;
  department: string;
  shift: Shift;
  yearsExperience: number;
  phone: string;
  /** Fecha de nacimiento ficticia (YYYY-MM-DD). */
  birthDate: string;
}

export const ADMIN_ACCOUNT: SeedAccount = {
  variable: 'DEMO_ADMIN_PASSWORD',
  internalId: 'ADM-001',
  email: 'director@example.com',
  role: 'ADMIN',
  name: 'Elena Márquez Solís',
  position: 'Director General',
  description: 'Dirección general del hospital ficticio.',
  specialty: 'Administración hospitalaria',
  department: 'Medicina Interna',
  shift: 'matutino',
  yearsExperience: 22,
  phone: '555-0100',
  birthDate: '1972-05-14',
};

export const EMPLOYEE_ACCOUNTS: readonly SeedAccount[] = [
  {
    variable: 'DEMO_DOCTOR_1_PASSWORD', internalId: 'EMP-001', email: 'medico1@example.com', role: 'DOCTOR',
    name: 'Andrés Villalba Ruiz', position: 'Médico de urgencias', description: 'Atención inicial de pacientes en urgencias.',
    specialty: 'Medicina de urgencias', department: 'Urgencias', shift: 'matutino', yearsExperience: 9,
    phone: '555-0101', birthDate: '1985-03-08',
  },
  {
    variable: 'DEMO_DOCTOR_2_PASSWORD', internalId: 'EMP-002', email: 'medico2@example.com', role: 'DOCTOR',
    name: 'Mariana Ocampo Lezama', position: 'Cardióloga', description: 'Seguimiento de pacientes cardiológicos hospitalizados.',
    specialty: 'Cardiología', department: 'Cardiología', shift: 'vespertino', yearsExperience: 14,
    phone: '555-0102', birthDate: '1979-11-21',
  },
  {
    variable: 'DEMO_DOCTOR_3_PASSWORD', internalId: 'EMP-003', email: 'medico3@example.com', role: 'DOCTOR',
    name: 'Julián Herrera Batista', position: 'Pediatra', description: 'Atención de pacientes pediátricos.',
    specialty: 'Pediatría', department: 'Pediatría', shift: 'matutino', yearsExperience: 7,
    phone: '555-0103', birthDate: '1988-07-02',
  },
  {
    variable: 'DEMO_NURSE_1_PASSWORD', internalId: 'EMP-004', email: 'enfermero1@example.com', role: 'NURSE',
    name: 'Sofía Paredes Quintero', position: 'Enfermera de urgencias', description: 'Triage y cuidados en urgencias.',
    specialty: 'Enfermería de urgencias', department: 'Urgencias', shift: 'matutino', yearsExperience: 6,
    phone: '555-0104', birthDate: '1990-01-17',
  },
  {
    variable: 'DEMO_NURSE_2_PASSWORD', internalId: 'EMP-005', email: 'enfermero2@example.com', role: 'NURSE',
    name: 'Diego Santillán Mora', position: 'Enfermero cardiológico', description: 'Cuidados de pacientes con monitoreo cardíaco.',
    specialty: 'Enfermería cardiovascular', department: 'Cardiología', shift: 'vespertino', yearsExperience: 11,
    phone: '555-0105', birthDate: '1983-09-30',
  },
  {
    variable: 'DEMO_NURSE_3_PASSWORD', internalId: 'EMP-006', email: 'enfermero3@example.com', role: 'NURSE',
    name: 'Valeria Montiel Roldán', position: 'Enfermera quirúrgica', description: 'Preparación y recuperación de pacientes quirúrgicos.',
    specialty: 'Enfermería quirúrgica', department: 'Cirugía', shift: 'matutino', yearsExperience: 8,
    phone: '555-0106', birthDate: '1987-04-12',
  },
  {
    variable: 'DEMO_NURSE_4_PASSWORD', internalId: 'EMP-007', email: 'enfermero4@example.com', role: 'NURSE',
    name: 'Tomás Aguirre Lince', position: 'Enfermero de hospitalización', description: 'Cuidados de pacientes en hospitalización general.',
    specialty: 'Enfermería médico-quirúrgica', department: 'Medicina Interna', shift: 'vespertino', yearsExperience: 4,
    phone: '555-0107', birthDate: '1994-12-05',
  },
  {
    variable: 'DEMO_CLEANING_1_PASSWORD', internalId: 'EMP-008', email: 'limpieza1@example.com', role: 'CLEANING',
    name: 'Rosa Elvira Campos', position: 'Auxiliar de limpieza', description: 'Limpieza y desinfección del área de urgencias.',
    specialty: 'Limpieza hospitalaria', department: 'Urgencias', shift: 'matutino', yearsExperience: 12,
    phone: '555-0108', birthDate: '1976-06-23',
  },
  {
    variable: 'DEMO_CLEANING_2_PASSWORD', internalId: 'EMP-009', email: 'limpieza2@example.com', role: 'CLEANING',
    name: 'Héctor Ibarra Nieto', position: 'Auxiliar de limpieza', description: 'Higiene de áreas pediátricas.',
    specialty: 'Higiene y desinfección', department: 'Pediatría', shift: 'vespertino', yearsExperience: 3,
    phone: '555-0109', birthDate: '1992-02-29',
  },
  {
    variable: 'DEMO_CLEANING_3_PASSWORD', internalId: 'EMP-010', email: 'limpieza3@example.com', role: 'CLEANING',
    name: 'Carmen Lozano Prieto', position: 'Auxiliar de limpieza', description: 'Limpieza de áreas de imagenología.',
    specialty: 'Limpieza de áreas críticas', department: 'Radiología', shift: 'vespertino', yearsExperience: 5,
    phone: '555-0110', birthDate: '1989-10-11',
  },
];

export const DEMO_ACCOUNTS: readonly SeedAccount[] = [ADMIN_ACCOUNT, ...EMPLOYEE_ACCOUNTS];
export const DEMO_PASSWORD_VARIABLES: readonly string[] = DEMO_ACCOUNTS.map((account) => account.variable);

// ---------- Horario_de_Trabajo (lunes a viernes) ----------

export interface DaySchedule {
  startTime: string;
  endTime: string;
  mealStart: string;
  mealEnd: string;
  breaks: { startTime: string; endTime: string }[];
}

export const WORK_DAYS = [1, 2, 3, 4, 5] as const; // lunes a viernes

export const SCHEDULE_BY_SHIFT: Record<Shift, DaySchedule> = {
  matutino: {
    startTime: '07:00', endTime: '15:00', mealStart: '11:30', mealEnd: '12:00',
    breaks: [{ startTime: '09:30', endTime: '09:45' }, { startTime: '13:30', endTime: '13:45' }],
  },
  vespertino: {
    startTime: '14:00', endTime: '22:00', mealStart: '18:00', mealEnd: '18:30',
    breaks: [{ startTime: '16:00', endTime: '16:15' }, { startTime: '20:00', endTime: '20:15' }],
  },
};

// ---------- Documentos_de_Empleado (2 por Empleado) ----------

export interface SeedDocumentSpec {
  type: DocumentType;
  slug: string;
  title: (account: SeedAccount) => string;
  issuedDaysAgo: number;
  /** Días desde la fecha de referencia hasta el vencimiento; null = sin vencimiento. */
  expiresInDays: number | null;
}

export const DOCUMENT_SPECS: readonly SeedDocumentSpec[] = [
  {
    type: 'contratación', slug: 'contratacion',
    title: (account) => `Contrato laboral de ${account.name}`,
    issuedDaysAgo: 400, expiresInDays: null,
  },
  {
    type: 'acreditación', slug: 'acreditacion',
    title: (account) => `Acreditación profesional de ${account.name}`,
    issuedDaysAgo: 200, expiresInDays: 165,
  },
];

/** Empleado cuya acreditación aparece vencida, para mostrar la insignia "Vencido" (Req. 19.9). */
export const EXPIRED_ACCREDITATION_EMPLOYEE = 'EMP-003';

// ---------- Habitaciones (20) ----------

export const ROOMS: readonly { number: number; department: string; capacity: number }[] = [
  { number: 101, department: 'Urgencias', capacity: 1 },
  { number: 102, department: 'Urgencias', capacity: 2 },
  { number: 103, department: 'Urgencias', capacity: 2 },
  { number: 104, department: 'Urgencias', capacity: 4 },
  { number: 201, department: 'Cardiología', capacity: 1 },
  { number: 202, department: 'Cardiología', capacity: 2 },
  { number: 203, department: 'Cardiología', capacity: 2 },
  { number: 204, department: 'Cardiología', capacity: 4 },
  { number: 301, department: 'Pediatría', capacity: 1 },
  { number: 302, department: 'Pediatría', capacity: 2 },
  { number: 303, department: 'Pediatría', capacity: 4 },
  { number: 401, department: 'Cirugía', capacity: 1 },
  { number: 402, department: 'Cirugía', capacity: 2 },
  { number: 403, department: 'Cirugía', capacity: 2 },
  { number: 501, department: 'Radiología', capacity: 1 },
  { number: 502, department: 'Radiología', capacity: 2 },
  { number: 601, department: 'Medicina Interna', capacity: 1 },
  { number: 602, department: 'Medicina Interna', capacity: 2 },
  { number: 603, department: 'Medicina Interna', capacity: 2 },
  { number: 604, department: 'Medicina Interna', capacity: 4 },
];

// ---------- Pacientes (12: 7 activos, 3 dados de alta, 2 fallecidos) ----------

export interface SeedPatient {
  internalId: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  sex: PatientSex;
  phone: string | null;
  reason: string;
  department: string;
  doctor: string; // internalId del Médico responsable
  nurse: string; // internalId del Enfermero responsable
  status: PatientStatus;
  admittedDaysAgo: number;
  /** Habitación de la Asignación (activa o cerrada). null = sin Asignación. */
  room: number | null;
  /** Días antes de la referencia en que se dio de alta o falleció. */
  releasedDaysAgo?: number;
  medicalObservation: string;
  nursingObservation: string;
}

export const PATIENTS: readonly SeedPatient[] = [
  {
    internalId: 'PAC-001', firstName: 'Ramiro', lastName: 'Escobedo Lara', birthDate: '1961-02-11', sex: 'M', phone: '555-0201',
    reason: 'Dolor torácico en estudio.', department: 'Urgencias', doctor: 'EMP-001', nurse: 'EMP-004', status: 'activo',
    admittedDaysAgo: 3, room: 101, medicalObservation: 'Evolución estable.', nursingObservation: 'Signos vitales sin cambios.',
  },
  {
    internalId: 'PAC-002', firstName: 'Lorena', lastName: 'Bautista Ferrer', birthDate: '1990-08-27', sex: 'F', phone: '555-0202',
    reason: 'Crisis asmática moderada.', department: 'Urgencias', doctor: 'EMP-001', nurse: 'EMP-004', status: 'activo',
    admittedDaysAgo: 2, room: 102, medicalObservation: 'Respuesta favorable a broncodilatadores.', nursingObservation: '',
  },
  {
    internalId: 'PAC-003', firstName: 'Ernesto', lastName: 'Galindo Pizarro', birthDate: '1955-12-03', sex: 'M', phone: null,
    reason: 'Insuficiencia cardíaca descompensada.', department: 'Cardiología', doctor: 'EMP-002', nurse: 'EMP-005', status: 'activo',
    admittedDaysAgo: 5, room: 201, medicalObservation: 'Pendiente de ecocardiograma.', nursingObservation: 'Balance hídrico diario.',
  },
  {
    internalId: 'PAC-004', firstName: 'Adriana', lastName: 'Cuevas Montaño', birthDate: '1968-04-19', sex: 'F', phone: '555-0204',
    reason: 'Hipertensión arterial de difícil control.', department: 'Cardiología', doctor: 'EMP-002', nurse: 'EMP-005', status: 'activo',
    admittedDaysAgo: 4, room: 202, medicalObservation: '', nursingObservation: 'Toma de presión cada 4 horas.',
  },
  {
    internalId: 'PAC-005', firstName: 'Matías', lastName: 'Robles Andrade', birthDate: '2018-09-14', sex: 'M', phone: '555-0205',
    reason: 'Bronquiolitis.', department: 'Pediatría', doctor: 'EMP-003', nurse: 'EMP-006', status: 'activo',
    admittedDaysAgo: 1, room: 301, medicalObservation: 'Oxigenoterapia a bajo flujo.', nursingObservation: '',
  },
  {
    internalId: 'PAC-006', firstName: 'Patricia', lastName: 'Lemus Arriaga', birthDate: '1979-01-30', sex: 'F', phone: '555-0206',
    reason: 'Apendicitis aguda.', department: 'Cirugía', doctor: 'EMP-001', nurse: 'EMP-006', status: 'activo',
    admittedDaysAgo: 6, room: 401, medicalObservation: 'Programada para cirugía.', nursingObservation: 'Ayuno indicado.',
  },
  {
    internalId: 'PAC-007', firstName: 'Gilberto', lastName: 'Saucedo Ibarra', birthDate: '1949-06-08', sex: 'M', phone: null,
    reason: 'Diabetes descompensada.', department: 'Medicina Interna', doctor: 'EMP-002', nurse: 'EMP-007', status: 'activo',
    admittedDaysAgo: 2, room: null, medicalObservation: '', nursingObservation: '',
  },
  {
    internalId: 'PAC-008', firstName: 'Natalia', lastName: 'Ordóñez Vela', birthDate: '2015-03-22', sex: 'F', phone: '555-0208',
    reason: 'Neumonía adquirida en la comunidad.', department: 'Pediatría', doctor: 'EMP-003', nurse: 'EMP-006', status: 'dado de alta',
    admittedDaysAgo: 30, releasedDaysAgo: 20, room: 302, medicalObservation: 'Alta por mejoría.', nursingObservation: '',
  },
  {
    internalId: 'PAC-009', firstName: 'Federico', lastName: 'Castañeda Rivas', birthDate: '1972-10-16', sex: 'M', phone: '555-0209',
    reason: 'Colecistitis aguda.', department: 'Medicina Interna', doctor: 'EMP-002', nurse: 'EMP-007', status: 'dado de alta',
    admittedDaysAgo: 25, releasedDaysAgo: 15, room: 602, medicalObservation: 'Alta tras cirugía sin complicaciones.', nursingObservation: '',
  },
  {
    internalId: 'PAC-010', firstName: 'Irene', lastName: 'Valdivia Sosa', birthDate: '1996-05-05', sex: 'X', phone: '555-0210',
    reason: 'Deshidratación moderada.', department: 'Urgencias', doctor: 'EMP-001', nurse: 'EMP-004', status: 'dado de alta',
    admittedDaysAgo: 12, releasedDaysAgo: 8, room: 103, medicalObservation: 'Alta con hidratación oral.', nursingObservation: '',
  },
  {
    internalId: 'PAC-011', firstName: 'Octavio', lastName: 'Barrera Quiroz', birthDate: '1940-11-28', sex: 'M', phone: null,
    reason: 'Infarto agudo de miocardio.', department: 'Cardiología', doctor: 'EMP-002', nurse: 'EMP-005', status: 'fallecido',
    admittedDaysAgo: 40, releasedDaysAgo: 35, room: 203, medicalObservation: '', nursingObservation: '',
  },
  {
    internalId: 'PAC-012', firstName: 'Amparo', lastName: 'Linares Toledo', birthDate: '1938-07-19', sex: 'F', phone: null,
    reason: 'Insuficiencia respiratoria.', department: 'Medicina Interna', doctor: 'EMP-002', nurse: 'EMP-007', status: 'fallecido',
    admittedDaysAgo: 60, releasedDaysAgo: 50, room: 603, medicalObservation: '', nursingObservation: '',
  },
];

// ---------- Tratamientos_Programados (14) ----------

export interface SeedTreatment {
  id: number;
  patient: string;
  type: TreatmentType;
  status: TreatmentStatus;
  /** Días respecto a la referencia (negativo = pasado). */
  scheduledInDays: number;
  description: string;
}

export const TREATMENTS: readonly SeedTreatment[] = [
  { id: 1, patient: 'PAC-001', type: 'tratamiento', status: 'programado', scheduledInDays: 1, description: 'Control de signos vitales y analgesia.' },
  { id: 2, patient: 'PAC-001', type: 'tratamiento', status: 'realizado', scheduledInDays: -1, description: 'Curación de herida superficial.' },
  { id: 3, patient: 'PAC-002', type: 'tratamiento', status: 'programado', scheduledInDays: 2, description: 'Nebulización con broncodilatador.' },
  { id: 4, patient: 'PAC-003', type: 'tratamiento', status: 'programado', scheduledInDays: 1, description: 'Ecocardiograma de control.' },
  { id: 5, patient: 'PAC-003', type: 'cirugía', status: 'programado', scheduledInDays: 5, description: 'Cateterismo cardíaco programado.' },
  { id: 6, patient: 'PAC-004', type: 'tratamiento', status: 'realizado', scheduledInDays: -2, description: 'Ajuste de medicación antihipertensiva.' },
  { id: 7, patient: 'PAC-005', type: 'tratamiento', status: 'programado', scheduledInDays: 3, description: 'Terapia respiratoria.' },
  { id: 8, patient: 'PAC-006', type: 'cirugía', status: 'programado', scheduledInDays: 2, description: 'Apendicectomía programada.' },
  { id: 9, patient: 'PAC-006', type: 'tratamiento', status: 'cancelado', scheduledInDays: 1, description: 'Estudio preoperatorio repetido.' },
  { id: 10, patient: 'PAC-007', type: 'tratamiento', status: 'programado', scheduledInDays: 4, description: 'Control de glucemia capilar.' },
  { id: 11, patient: 'PAC-008', type: 'tratamiento', status: 'realizado', scheduledInDays: -28, description: 'Tratamiento antibiótico intravenoso.' },
  { id: 12, patient: 'PAC-009', type: 'cirugía', status: 'realizado', scheduledInDays: -22, description: 'Colecistectomía laparoscópica.' },
  { id: 13, patient: 'PAC-011', type: 'tratamiento', status: 'cancelado', scheduledInDays: -37, description: 'Sesión de rehabilitación cardíaca.' },
  { id: 14, patient: 'PAC-012', type: 'tratamiento', status: 'realizado', scheduledInDays: -58, description: 'Ventilación no invasiva.' },
];

// ---------- Proveedores (4) e inventario (20 Productos) ----------

export const SUPPLIERS: readonly { id: number; name: string; contact: string }[] = [
  { id: 1, name: 'Distribuidora Médica Andina (ficticia)', contact: 'ventas@insumos-andina.example.com · 555-0301' },
  { id: 2, name: 'Laboratorios Solaris (ficticio)', contact: 'pedidos@solaris.example.com · 555-0302' },
  { id: 3, name: 'Farmacéutica Horizonte (ficticia)', contact: 'contacto@horizonte.example.com · 555-0303' },
  { id: 4, name: 'Higiene Industrial Delta (ficticia)', contact: 'clientes@delta-higiene.example.com · 555-0304' },
];

export interface SeedMedication {
  type: MedicationType;
  activeIngredient: string;
  tradeName: string | null;
  controlClass: ControlClass;
  requiresPrescription: boolean;
}

export interface SeedProduct {
  id: number;
  name: string;
  category: ProductCategory;
  classification: string;
  /** Cantidad final después de aplicar los movimientos de la semilla. */
  quantity: number;
  minStock: number;
  supplierId: number;
  medication?: SeedMedication;
}

export const PRODUCTS: readonly SeedProduct[] = [
  // Insumo médico (7): una por cada Subcategoría_de_Insumo y una extra.
  { id: 1, name: 'Jeringa desechable 5 ml', category: 'insumo médico', classification: 'jeringa', quantity: 500, minStock: 100, supplierId: 1 },
  { id: 2, name: 'Sonda Foley 16 Fr', category: 'insumo médico', classification: 'sonda', quantity: 40, minStock: 50, supplierId: 1 },
  { id: 3, name: 'Catéter intravenoso 20G', category: 'insumo médico', classification: 'catéter', quantity: 300, minStock: 80, supplierId: 1 },
  { id: 4, name: 'Suero fisiológico 0.9 % 1 L', category: 'insumo médico', classification: 'suero', quantity: 120, minStock: 60, supplierId: 1 },
  { id: 5, name: 'Pinza Kelly curva', category: 'insumo médico', classification: 'instrumental', quantity: 25, minStock: 10, supplierId: 1 },
  { id: 6, name: 'Gasas estériles 10 x 10 cm', category: 'insumo médico', classification: 'material médico', quantity: 0, minStock: 200, supplierId: 1 },
  { id: 7, name: 'Guantes de exploración', category: 'insumo médico', classification: 'material médico', quantity: 1000, minStock: 300, supplierId: 1 },
  // Medicamento (7). La clasificación es el tipo de medicamento (Req. 7.2).
  {
    id: 8, name: 'Paracetamol 500 mg', category: 'medicamento', classification: 'genérico', quantity: 800, minStock: 200, supplierId: 2,
    medication: { type: 'genérico', activeIngredient: 'Paracetamol', tradeName: null, controlClass: 'venta libre', requiresPrescription: false },
  },
  {
    id: 9, name: 'Amoxicilina 500 mg', category: 'medicamento', classification: 'genérico', quantity: 150, minStock: 100, supplierId: 2,
    medication: { type: 'genérico', activeIngredient: 'Amoxicilina', tradeName: null, controlClass: 'receta simple', requiresPrescription: true },
  },
  {
    id: 10, name: 'Ketorolaco 30 mg inyectable', category: 'medicamento', classification: 'genérico', quantity: 60, minStock: 30, supplierId: 3,
    medication: { type: 'genérico', activeIngredient: 'Ketorolaco', tradeName: null, controlClass: 'uso hospitalario', requiresPrescription: true },
  },
  {
    id: 11, name: 'Morfina 10 mg/ml', category: 'medicamento', classification: 'genérico', quantity: 20, minStock: 25, supplierId: 3,
    medication: { type: 'genérico', activeIngredient: 'Morfina', tradeName: null, controlClass: 'controlado', requiresPrescription: true },
  },
  {
    id: 12, name: 'Cardiolex 5 mg', category: 'medicamento', classification: 'de patente', quantity: 90, minStock: 40, supplierId: 2,
    medication: { type: 'de patente', activeIngredient: 'Amlodipino', tradeName: 'Cardiolex', controlClass: 'receta simple', requiresPrescription: true },
  },
  {
    id: 13, name: 'Clonazepam 2 mg', category: 'medicamento', classification: 'genérico', quantity: 35, minStock: 20, supplierId: 3,
    medication: { type: 'genérico', activeIngredient: 'Clonazepam', tradeName: null, controlClass: 'controlado', requiresPrescription: true },
  },
  {
    id: 14, name: 'Azitrex 500 mg', category: 'medicamento', classification: 'de patente', quantity: 45, minStock: 30, supplierId: 2,
    medication: { type: 'de patente', activeIngredient: 'Azitromicina', tradeName: 'Azitrex', controlClass: 'receta retenida', requiresPrescription: true },
  },
  // Material de limpieza (6). La clasificación es texto libre.
  { id: 15, name: 'Desinfectante clorado 5 L', category: 'material de limpieza', classification: 'desinfectante', quantity: 30, minStock: 10, supplierId: 4 },
  { id: 16, name: 'Detergente enzimático 1 L', category: 'material de limpieza', classification: 'detergente', quantity: 8, minStock: 10, supplierId: 4 },
  { id: 17, name: 'Alcohol en gel 1 L', category: 'material de limpieza', classification: 'antiséptico', quantity: 50, minStock: 20, supplierId: 4 },
  { id: 18, name: 'Bolsas rojas para residuos biológicos', category: 'material de limpieza', classification: 'residuos', quantity: 200, minStock: 100, supplierId: 4 },
  { id: 19, name: 'Toallas de papel interdobladas', category: 'material de limpieza', classification: 'papel', quantity: 60, minStock: 40, supplierId: 4 },
  { id: 20, name: 'Jabón líquido neutro 1 L', category: 'material de limpieza', classification: 'jabón', quantity: 25, minStock: 10, supplierId: 4 },
];

// ---------- Entregas_de_Proveedor (8: 4 recibidas, 3 programadas, 1 cancelada) ----------

export interface SeedDelivery {
  id: number;
  supplierId: number;
  productId: number;
  quantityRequested: number;
  scheduledInDays: number;
  status: DeliveryStatus;
  /** Solo en entregas recibidas. */
  quantityReceived?: number;
}

export const DELIVERIES: readonly SeedDelivery[] = [
  { id: 1, supplierId: 1, productId: 1, quantityRequested: 200, scheduledInDays: -20, status: 'recibida', quantityReceived: 200 },
  { id: 2, supplierId: 2, productId: 8, quantityRequested: 300, scheduledInDays: -15, status: 'recibida', quantityReceived: 300 },
  { id: 3, supplierId: 3, productId: 11, quantityRequested: 10, scheduledInDays: -10, status: 'recibida', quantityReceived: 10 },
  { id: 4, supplierId: 4, productId: 15, quantityRequested: 12, scheduledInDays: -5, status: 'recibida', quantityReceived: 12 },
  { id: 5, supplierId: 1, productId: 6, quantityRequested: 400, scheduledInDays: 2, status: 'programada' },
  { id: 6, supplierId: 2, productId: 9, quantityRequested: 100, scheduledInDays: 4, status: 'programada' },
  { id: 7, supplierId: 4, productId: 16, quantityRequested: 20, scheduledInDays: 6, status: 'programada' },
  { id: 8, supplierId: 3, productId: 13, quantityRequested: 30, scheduledInDays: -3, status: 'cancelada' },
];

/** Días antes de la referencia del ajuste inicial de inventario (anterior a todas las entregas). */
export const INITIAL_STOCK_DAYS_AGO = 30;

// ---------- Equipos_Médicos (12) y Registros_de_Mantenimiento (6) ----------

export const EQUIPMENT: readonly {
  id: number; name: string; category: string; department: string; quantity: number; location: string;
  operationalStatus: OperationalStatus; maintenanceRequired: boolean;
}[] = [
  { id: 1, name: 'Desfibrilador bifásico', category: 'Soporte vital', department: 'Urgencias', quantity: 3, location: 'Sala de reanimación', operationalStatus: 'disponible', maintenanceRequired: false },
  { id: 2, name: 'Monitor multiparámetro', category: 'Monitoreo', department: 'Urgencias', quantity: 6, location: 'Box de observación', operationalStatus: 'en uso', maintenanceRequired: false },
  { id: 3, name: 'Electrocardiógrafo de 12 derivaciones', category: 'Diagnóstico', department: 'Cardiología', quantity: 2, location: 'Consultorio 2', operationalStatus: 'disponible', maintenanceRequired: false },
  { id: 4, name: 'Monitor Holter', category: 'Monitoreo', department: 'Cardiología', quantity: 4, location: 'Almacén de cardiología', operationalStatus: 'en mantenimiento', maintenanceRequired: true },
  { id: 5, name: 'Incubadora neonatal', category: 'Soporte vital', department: 'Pediatría', quantity: 3, location: 'Área neonatal', operationalStatus: 'en uso', maintenanceRequired: false },
  { id: 6, name: 'Bomba de infusión pediátrica', category: 'Terapia', department: 'Pediatría', quantity: 5, location: 'Estación de enfermería', operationalStatus: 'disponible', maintenanceRequired: false },
  { id: 7, name: 'Mesa quirúrgica', category: 'Quirófano', department: 'Cirugía', quantity: 2, location: 'Quirófano 1', operationalStatus: 'en uso', maintenanceRequired: false },
  { id: 8, name: 'Lámpara quirúrgica LED', category: 'Quirófano', department: 'Cirugía', quantity: 2, location: 'Quirófano 2', operationalStatus: 'en mantenimiento', maintenanceRequired: true },
  { id: 9, name: 'Equipo de rayos X portátil', category: 'Imagen', department: 'Radiología', quantity: 1, location: 'Sala de rayos X', operationalStatus: 'fuera de servicio', maintenanceRequired: true },
  { id: 10, name: 'Ultrasonido Doppler', category: 'Imagen', department: 'Radiología', quantity: 2, location: 'Sala de ultrasonido', operationalStatus: 'disponible', maintenanceRequired: false },
  { id: 11, name: 'Bomba de infusión volumétrica', category: 'Terapia', department: 'Medicina Interna', quantity: 6, location: 'Hospitalización 3er piso', operationalStatus: 'disponible', maintenanceRequired: false },
  { id: 12, name: 'Concentrador de oxígeno', category: 'Soporte vital', department: 'Medicina Interna', quantity: 4, location: 'Almacén de equipos', operationalStatus: 'fuera de servicio', maintenanceRequired: true },
];

export const MAINTENANCE_RECORDS: readonly {
  id: number; equipmentId: number; type: MaintenanceType; startDaysAgo: number; endDaysAgo: number | null;
  description: string; technician: string; resultingStatus: 'disponible' | 'fuera de servicio' | null;
}[] = [
  { id: 1, equipmentId: 4, type: 'preventivo', startDaysAgo: 2, endDaysAgo: null, description: 'Revisión preventiva y calibración.', technician: 'Técnico Biomédico Demo 1', resultingStatus: null },
  { id: 2, equipmentId: 8, type: 'correctivo', startDaysAgo: 1, endDaysAgo: null, description: 'Falla intermitente en el brazo articulado.', technician: 'Técnico Biomédico Demo 2', resultingStatus: null },
  { id: 3, equipmentId: 9, type: 'reparación', startDaysAgo: 40, endDaysAgo: 35, description: 'Reparación del tubo de rayos X; requiere pieza no disponible.', technician: 'Técnico Biomédico Demo 1', resultingStatus: 'fuera de servicio' },
  { id: 4, equipmentId: 1, type: 'preventivo', startDaysAgo: 60, endDaysAgo: 59, description: 'Prueba de descarga y cambio de baterías.', technician: 'Técnico Biomédico Demo 3', resultingStatus: 'disponible' },
  { id: 5, equipmentId: 2, type: 'correctivo', startDaysAgo: 30, endDaysAgo: 28, description: 'Sustitución del sensor de oximetría.', technician: 'Técnico Biomédico Demo 2', resultingStatus: 'disponible' },
  { id: 6, equipmentId: 12, type: 'reparación', startDaysAgo: 20, endDaysAgo: 18, description: 'Revisión del compresor; se recomienda reemplazo.', technician: 'Técnico Biomédico Demo 3', resultingStatus: 'fuera de servicio' },
];

// ---------- Eventos (6) y Días_Inhábiles (3) ----------

export const EVENTS: readonly {
  id: number; title: string; description: string; type: StoredEventType; startInDays: number;
  startHour: number; durationHours: number;
  /** internalId del propietario y creador (solo agenda individual). */
  owner?: string;
}[] = [
  { id: 1, title: 'Reunión mensual de jefes de servicio', description: 'Revisión de indicadores del mes.', type: 'general', startInDays: 10, startHour: 10, durationHours: 2 },
  { id: 2, title: 'Simulacro de evacuación', description: 'Simulacro general en todas las áreas.', type: 'general', startInDays: 20, startHour: 11, durationHours: 1 },
  { id: 3, title: 'Campaña de vacunación del personal', description: 'Vacunación anual para el personal.', type: 'actividad', startInDays: 3, startHour: 9, durationHours: 4 },
  { id: 4, title: 'Capacitación en higiene de manos', description: 'Taller práctico para el personal.', type: 'actividad', startInDays: 14, startHour: 12, durationHours: 2 },
  { id: 5, title: 'Entrega de uniformes del personal', description: 'Recepción en el almacén general.', type: 'entrega', startInDays: 5, startHour: 8, durationHours: 1 },
  { id: 6, title: 'Revisión de casos clínicos', description: 'Preparación de la sesión de casos de urgencias.', type: 'agenda individual', startInDays: 1, startHour: 16, durationHours: 1, owner: 'EMP-001' },
];

export const NON_WORKING_DAYS: readonly { inDays: number; title: string; description: string }[] = [
  { inDays: 15, title: 'Aniversario del hospital (ficticio)', description: 'Sin actividad administrativa ordinaria.' },
  { inDays: 45, title: 'Mantenimiento general de instalaciones', description: 'Solo se atienden urgencias.' },
  { inDays: 90, title: 'Cierre administrativo de fin de periodo', description: 'Oficinas administrativas cerradas.' },
];
