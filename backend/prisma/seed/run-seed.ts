// Semilla de datos demo (tarea 2.3; Req. 1.7, 5.1, 6.1, 7.1, 8.1, 9.1 y 14).
//
// Pasos:
//   1. Antes de abrir la transacción: valida las cuentas existentes, decide las contraseñas,
//      comprueba que sean distintas, calcula los hashes bcrypt y prepara los PDF ficticios.
//   2. Escribe todos los datos en una sola transacción. Si algo falla, Prisma revierte todo
//      y se borran los PDF creados en esta ejecución (Req. 14.9).
//
// Idempotencia (Req. 14.4): upsert por clave natural (Department.name, User.email,
// Patient.internalId, Room.number, NonWorkingDay.date, MedicationInfo.productId) y por ID fijo
// en el resto. Los registros existentes no se modifican (update vacío), salvo la contraseña de
// una cuenta cuya variable DEMO_*_PASSWORD esté definida. Todas las fechas se calculan desde una
// fecha de referencia que se guarda como createdAt del Director, así que no cambian al repetir.
// La semilla no escribe en la Bitácora_de_Auditoría.

import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { INITIAL_DEPARTMENTS } from '../../src/domain/constants';
import { BCRYPT_COST, hashPassword, verifyPassword } from '../../src/lib/password';
import { prisma as sharedClient } from '../../src/lib/prisma';
import { withTransaction, type DbClient } from '../../src/repositories/transaction';
import {
  ADMIN_ACCOUNT,
  DELIVERIES,
  DEMO_ACCOUNTS,
  DOCUMENT_SPECS,
  EMPLOYEE_ACCOUNTS,
  EQUIPMENT,
  EVENTS,
  EXPIRED_ACCREDITATION_EMPLOYEE,
  INITIAL_STOCK_DAYS_AGO,
  MAINTENANCE_RECORDS,
  NON_WORKING_DAYS,
  PATIENTS,
  PRODUCTS,
  ROOMS,
  SCHEDULE_BY_SHIFT,
  SUPPLIERS,
  TREATMENTS,
  WORK_DAYS,
  type SeedAccount,
} from './data';
import { buildFictitiousPdf } from './pdf';

export { DEMO_PASSWORD_VARIABLES } from './data';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const DEFAULT_BCRYPT_ROUNDS = BCRYPT_COST;
const SEED_TRANSACTION_TIMEOUT_MS = 60_000;
export const DEFAULT_DOCUMENTS_DIR = join(__dirname, '..', '..', 'storage', 'documents');

/** Error de la semilla con un mensaje en español apto para la consola (sin contraseñas). */
export class SeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedError';
  }
}

export interface SeedOptions {
  /** Cliente Prisma; por defecto la instancia compartida (DATABASE_URL). */
  client?: PrismaClient;
  /** Contraseñas demo por nombre de variable (de loadEnv). */
  demoPasswords?: Readonly<Record<string, string>>;
  /** Carpeta privada de documentos; por defecto backend/storage/documents. */
  documentsDir?: string;
  /** Fecha de referencia para una base nueva; por defecto, ahora. */
  now?: Date;
  /** Costo de bcrypt; 10 por defecto (las pruebas usan 4). */
  bcryptRounds?: number;
  /** Solo para pruebas: se ejecuta al final, dentro de la transacción. */
  beforeCommit?: (tx: DbClient) => Promise<void>;
}

export type PasswordSource = 'variable' | 'generada' | 'conservada';

export interface SeedCredential {
  email: string;
  role: string;
  variable: string;
  source: PasswordSource;
  /** null si se conservó la contraseña existente. */
  password: string | null;
}

export interface SeedResult {
  referenceDate: Date;
  credentials: SeedCredential[];
  /** Rutas absolutas de los PDF creados en esta ejecución. */
  createdFiles: string[];
}

// ---------- Fechas ----------

const shiftDays = (base: Date, days: number, hours = 0) => new Date(base.getTime() + days * DAY_MS + hours * HOUR_MS);
const midnightUtc = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
const dateOnly = (isoDate: string) => new Date(`${isoDate}T00:00:00.000Z`);

// ---------- Contraseñas ----------

interface PasswordPlan {
  account: SeedAccount;
  source: PasswordSource;
  password: string | null;
  hash: string | null;
}

const isSet = (value: string | undefined): value is string => value !== undefined && value.trim() !== '';

/** Contraseña aleatoria de 16 caracteres (12 bytes en base64url). */
const randomPassword = () => randomBytes(12).toString('base64url');

async function planPasswords(
  client: PrismaClient,
  demoPasswords: Readonly<Record<string, string>>,
  rounds: number,
): Promise<PasswordPlan[]> {
  const existing = await client.user.findMany({
    where: { email: { in: DEMO_ACCOUNTS.map((account) => account.email) } },
    select: { email: true, role: true, internalId: true, passwordHash: true },
  });
  const byEmail = new Map(existing.map((user) => [user.email, user]));

  for (const account of DEMO_ACCOUNTS) {
    const user = byEmail.get(account.email);
    if (user && (user.role !== account.role || user.internalId !== account.internalId)) {
      throw new SeedError(
        `La cuenta ${account.email} ya existe con un rol o un ID interno distintos de los de la semilla. ` +
          'No se sobrescribe: revísala antes de volver a ejecutar la semilla.',
      );
    }
  }

  // 1. Las contraseñas indicadas en variables deben ser distintas entre sí.
  const provided = DEMO_ACCOUNTS.filter((account) => isSet(demoPasswords[account.variable]));
  const byValue = new Map<string, string[]>();
  for (const account of provided) {
    const value = demoPasswords[account.variable] as string;
    byValue.set(value, [...(byValue.get(value) ?? []), account.variable]);
  }
  const duplicated = [...byValue.values()].filter((variables) => variables.length > 1);
  if (duplicated.length > 0) {
    throw new SeedError(
      'Las contraseñas demo deben ser distintas. Estas variables tienen el mismo valor: ' +
        `${duplicated.map((variables) => variables.join(' = ')).join('; ')}.`,
    );
  }

  // 2. Tampoco pueden coincidir con la contraseña que se conserva de otra cuenta.
  const kept = DEMO_ACCOUNTS.filter((account) => !isSet(demoPasswords[account.variable]) && byEmail.has(account.email));
  for (const account of provided) {
    for (const keptAccount of kept) {
      const keptHash = byEmail.get(keptAccount.email)?.passwordHash ?? '';
      if (await verifyPassword(demoPasswords[account.variable] as string, keptHash)) {
        throw new SeedError(
          `La contraseña de ${account.variable} coincide con la contraseña actual de ${keptAccount.email} ` +
            `(${keptAccount.variable}). Cada cuenta demo debe tener una contraseña distinta.`,
        );
      }
    }
  }

  // 3. Contraseñas aleatorias para las cuentas nuevas sin variable.
  const used = new Set(provided.map((account) => demoPasswords[account.variable] as string));
  const plans: PasswordPlan[] = DEMO_ACCOUNTS.map((account) => {
    const value = demoPasswords[account.variable];
    if (isSet(value)) return { account, source: 'variable', password: value, hash: null };
    if (byEmail.has(account.email)) return { account, source: 'conservada', password: null, hash: null };
    let generated = randomPassword();
    while (used.has(generated)) generated = randomPassword();
    used.add(generated);
    return { account, source: 'generada', password: generated, hash: null };
  });

  // 4. Hashes con la misma función del Backend (lib/password.ts), antes de abrir la transacción.
  for (const plan of plans) {
    if (plan.password !== null) plan.hash = await hashPassword(plan.password, rounds);
  }
  return plans;
}

// ---------- Documentos PDF ----------

interface DocumentPlan {
  id: number;
  account: SeedAccount;
  type: (typeof DOCUMENT_SPECS)[number]['type'];
  title: string;
  issuedAt: Date;
  expiresAt: Date | null;
  /** Ruta relativa dentro de storage/documents, con "/". */
  filePath: string;
  fileSize: number;
}

function planDocuments(reference: Date, documentsDir: string, createdFiles: string[]): DocumentPlan[] {
  const plans: DocumentPlan[] = [];
  EMPLOYEE_ACCOUNTS.forEach((account, accountIndex) => {
    DOCUMENT_SPECS.forEach((spec, specIndex) => {
      const filePath = `seed/${account.internalId}-${spec.slug}.pdf`;
      const absolutePath = join(documentsDir, ...filePath.split('/'));
      if (!existsSync(absolutePath)) {
        const pdf = buildFictitiousPdf([
          'DOCUMENTO FICTICIO - SOLO PARA DEMOSTRACION',
          'Sistema de Gestion y Administracion Hospitalaria (prototipo academico)',
          `Tipo de documento: ${spec.type}`,
          `Empleado: ${account.name} (${account.internalId})`,
          `Titulo: ${spec.title(account)}`,
          'Este archivo no tiene validez legal ni contiene datos reales.',
        ]);
        mkdirSync(dirname(absolutePath), { recursive: true });
        writeFileSync(absolutePath, pdf, { flag: 'wx' });
        createdFiles.push(absolutePath);
      }
      const expiresInDays =
        spec.type === 'acreditación' && account.internalId === EXPIRED_ACCREDITATION_EMPLOYEE ? -10 : spec.expiresInDays;
      plans.push({
        id: accountIndex * DOCUMENT_SPECS.length + specIndex + 1,
        account,
        type: spec.type,
        title: spec.title(account),
        issuedAt: shiftDays(reference, -spec.issuedDaysAgo - accountIndex * 7),
        expiresAt: expiresInDays === null ? null : shiftDays(reference, expiresInDays),
        filePath,
        fileSize: statSync(absolutePath).size,
      });
    });
  });
  return plans;
}

function removeFiles(paths: readonly string[]): void {
  for (const path of paths) {
    try {
      unlinkSync(path);
    } catch {
      // El archivo ya no existe: no hay nada que limpiar.
    }
  }
}

// ---------- Comprobación de registros con ID fijo ----------

/** Detiene la semilla si el registro existente con ese ID no es el de la semilla. */
function assertSame(entity: string, record: object, expected: Record<string, unknown>): void {
  const values = record as Record<string, unknown>;
  for (const [field, value] of Object.entries(expected)) {
    if (values[field] !== value) {
      throw new SeedError(
        `Ya existe un registro de ${entity} con id ${String(values.id)} que no corresponde a la semilla ` +
          `(campo ${field} distinto). No se sobrescribe; usa una base de datos nueva o revisa ese registro.`,
      );
    }
  }
}

// ---------- Escritura (dentro de la transacción) ----------

async function writeSeedData(
  tx: DbClient,
  reference: Date,
  passwords: readonly PasswordPlan[],
  documents: readonly DocumentPlan[],
): Promise<void> {
  // Departamentos
  const departmentIds = new Map<string, number>();
  for (const name of INITIAL_DEPARTMENTS) {
    const department = await tx.department.upsert({ where: { name }, create: { name }, update: {} });
    departmentIds.set(name, department.id);
  }
  const departmentId = (name: string) => {
    const id = departmentIds.get(name);
    if (id === undefined) throw new SeedError(`Departamento desconocido en los datos de la semilla: ${name}.`);
    return id;
  };

  // Cuentas (1 Administrador + 10 Empleados)
  const userIds = new Map<string, number>();
  for (const plan of passwords) {
    const account = plan.account;
    if (plan.source === 'conservada') {
      const user = await tx.user.findUniqueOrThrow({ where: { email: account.email }, select: { id: true } });
      userIds.set(account.internalId, user.id);
      continue;
    }
    const passwordHash = plan.hash as string;
    const user = await tx.user.upsert({
      where: { email: account.email },
      create: {
        internalId: account.internalId,
        email: account.email,
        passwordHash,
        role: account.role,
        mustChangePassword: false,
        active: true,
        name: account.name,
        position: account.position,
        description: account.description,
        specialty: account.specialty,
        departmentId: departmentId(account.department),
        yearsExperience: account.yearsExperience,
        shift: account.shift,
        phone: account.phone,
        birthDate: dateOnly(account.birthDate),
        // El createdAt del Director guarda la fecha de referencia de la semilla.
        ...(account === ADMIN_ACCOUNT ? { createdAt: reference } : {}),
      },
      update: plan.source === 'variable' ? { passwordHash } : {},
    });
    userIds.set(account.internalId, user.id);
  }
  const userId = (internalId: string) => {
    const id = userIds.get(internalId);
    if (id === undefined) throw new SeedError(`Cuenta desconocida en los datos de la semilla: ${internalId}.`);
    return id;
  };
  const adminId = userId(ADMIN_ACCOUNT.internalId);

  // Horario_de_Trabajo: 5 días por Empleado (50 franjas) con 2 Descansos por día (100).
  for (const [accountIndex, account] of EMPLOYEE_ACCOUNTS.entries()) {
    const schedule = SCHEDULE_BY_SHIFT[account.shift];
    for (const [dayIndex, dayOfWeek] of WORK_DAYS.entries()) {
      const slotId = accountIndex * WORK_DAYS.length + dayIndex + 1;
      const slot = await tx.scheduleSlot.upsert({
        where: { id: slotId },
        create: {
          id: slotId,
          userId: userId(account.internalId),
          dayOfWeek,
          startTime: schedule.startTime,
          endTime: schedule.endTime,
          mealStart: schedule.mealStart,
          mealEnd: schedule.mealEnd,
        },
        update: {},
      });
      assertSame('ScheduleSlot', slot, { userId: userId(account.internalId), dayOfWeek });
      for (const [breakIndex, pause] of schedule.breaks.entries()) {
        const breakId = (slotId - 1) * schedule.breaks.length + breakIndex + 1;
        const saved = await tx.scheduleBreak.upsert({
          where: { id: breakId },
          create: { id: breakId, slotId, startTime: pause.startTime, endTime: pause.endTime },
          update: {},
        });
        assertSame('ScheduleBreak', saved, { slotId });
      }
    }
  }

  // Documentos_de_Empleado (20)
  for (const doc of documents) {
    const saved = await tx.employeeDocument.upsert({
      where: { id: doc.id },
      create: {
        id: doc.id,
        userId: userId(doc.account.internalId),
        type: doc.type,
        title: doc.title,
        issuedAt: doc.issuedAt,
        expiresAt: doc.expiresAt,
        filePath: doc.filePath,
        fileSize: doc.fileSize,
      },
      update: {},
    });
    assertSame('EmployeeDocument', saved, { userId: userId(doc.account.internalId), type: doc.type, filePath: doc.filePath });
  }

  // Habitaciones (20)
  const roomIds = new Map<number, number>();
  for (const room of ROOMS) {
    const saved = await tx.room.upsert({
      where: { number: room.number },
      create: { number: room.number, departmentId: departmentId(room.department), capacity: room.capacity },
      update: {},
    });
    assertSame('Room', saved, { departmentId: departmentId(room.department) });
    roomIds.set(room.number, saved.id);
  }

  // Pacientes (12), movimientos (17), Asignaciones (11) y Tratamientos (14)
  const patientIds = new Map<string, number>();
  const admissionDates = new Map<string, Date>();
  let releaseMovementId = PATIENTS.length;
  let assignmentId = 0;

  for (const [index, patient] of PATIENTS.entries()) {
    const admissionDate = shiftDays(reference, -patient.admittedDaysAgo, -2);
    const releaseDate = patient.releasedDaysAgo === undefined ? null : shiftDays(reference, -patient.releasedDaysAgo, -3);
    const doctorId = userId(patient.doctor);
    const nurseId = userId(patient.nurse);

    const saved = await tx.patient.upsert({
      where: { internalId: patient.internalId },
      create: {
        internalId: patient.internalId,
        firstName: patient.firstName,
        lastName: patient.lastName,
        birthDate: dateOnly(patient.birthDate),
        sex: patient.sex,
        phone: patient.phone,
        admissionDate,
        reason: patient.reason,
        status: patient.status,
        deceasedAt: patient.status === 'fallecido' ? releaseDate : null,
        departmentId: departmentId(patient.department),
        doctorId,
        nurseId,
        medicalObservation: patient.medicalObservation,
        medicalObservationAt: patient.medicalObservation ? shiftDays(admissionDate, 0, 4) : null,
        medicalObservationById: patient.medicalObservation ? doctorId : null,
        nursingObservation: patient.nursingObservation,
        nursingObservationAt: patient.nursingObservation ? shiftDays(admissionDate, 0, 5) : null,
        nursingObservationById: patient.nursingObservation ? nurseId : null,
      },
      update: {},
    });
    patientIds.set(patient.internalId, saved.id);
    admissionDates.set(patient.internalId, admissionDate);

    const admissionId = index + 1;
    const admission = await tx.patientMovement.upsert({
      where: { id: admissionId },
      create: {
        id: admissionId,
        patientId: saved.id,
        type: 'ingreso',
        occurredAt: admissionDate,
        departmentId: departmentId(patient.department),
        userId: adminId,
        note: 'Ingreso registrado en los datos de demostración.',
      },
      update: {},
    });
    assertSame('PatientMovement', admission, { patientId: saved.id, type: 'ingreso' });

    if (releaseDate) {
      releaseMovementId += 1;
      const type = patient.status === 'fallecido' ? 'fallecimiento' : 'alta';
      const release = await tx.patientMovement.upsert({
        where: { id: releaseMovementId },
        create: {
          id: releaseMovementId,
          patientId: saved.id,
          type,
          occurredAt: releaseDate,
          departmentId: departmentId(patient.department),
          userId: adminId,
          note: type === 'alta' ? 'Alta registrada en los datos de demostración.' : 'Fallecimiento registrado en los datos de demostración.',
        },
        update: {},
      });
      assertSame('PatientMovement', release, { patientId: saved.id, type });
    }

    if (patient.room !== null) {
      assignmentId += 1;
      const roomId = roomIds.get(patient.room);
      if (roomId === undefined) throw new SeedError(`Habitación desconocida en los datos de la semilla: ${patient.room}.`);
      const assignment = await tx.roomAssignment.upsert({
        where: { id: assignmentId },
        create: {
          id: assignmentId,
          roomId,
          patientId: saved.id,
          startedAt: shiftDays(admissionDate, 0, 1),
          endedAt: releaseDate,
          releaseReason: releaseDate ? (patient.status === 'fallecido' ? 'fallecimiento' : 'alta') : null,
        },
        update: {},
      });
      assertSame('RoomAssignment', assignment, { patientId: saved.id, roomId });
    }
  }

  for (const treatment of TREATMENTS) {
    const patient = PATIENTS.find((item) => item.internalId === treatment.patient);
    const patientId = patientIds.get(treatment.patient);
    if (!patient || patientId === undefined) throw new SeedError(`Paciente desconocido en un tratamiento: ${treatment.patient}.`);
    const scheduledAt = shiftDays(reference, treatment.scheduledInDays, 1);
    const saved = await tx.treatment.upsert({
      where: { id: treatment.id },
      create: {
        id: treatment.id,
        patientId,
        type: treatment.type,
        status: treatment.status,
        scheduledAt,
        performedAt: treatment.status === 'realizado' ? shiftDays(scheduledAt, 0, 1) : null,
        description: treatment.description,
        createdById: userId(patient.doctor),
      },
      update: {},
    });
    assertSame('Treatment', saved, { patientId, type: treatment.type });
  }

  // Proveedores (4), Productos (20) y datos de Medicamento
  for (const supplier of SUPPLIERS) {
    const saved = await tx.supplier.upsert({ where: { id: supplier.id }, create: supplier, update: {} });
    assertSame('Supplier', saved, { name: supplier.name });
  }

  const initialStockDate = shiftDays(reference, -INITIAL_STOCK_DAYS_AGO);
  for (const product of PRODUCTS) {
    const saved = await tx.product.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        name: product.name,
        category: product.category,
        classification: product.classification,
        quantity: product.quantity,
        minStock: product.minStock,
        supplierId: product.supplierId,
        createdAt: initialStockDate,
      },
      update: {},
    });
    assertSame('Product', saved, { name: product.name, category: product.category });
    if (product.medication) {
      await tx.medicationInfo.upsert({
        where: { productId: product.id },
        create: { productId: product.id, ...product.medication },
        update: {},
      });
    }
  }

  // Entregas_de_Proveedor (8)
  for (const delivery of DELIVERIES) {
    const scheduledDate = shiftDays(reference, delivery.scheduledInDays);
    const received = delivery.status === 'recibida';
    const saved = await tx.supplierDelivery.upsert({
      where: { id: delivery.id },
      create: {
        id: delivery.id,
        supplierId: delivery.supplierId,
        productId: delivery.productId,
        quantityRequested: delivery.quantityRequested,
        scheduledDate,
        status: delivery.status,
        receivedDate: received ? scheduledDate : null,
        quantityReceived: received ? (delivery.quantityReceived ?? null) : null,
      },
      update: {},
    });
    assertSame('SupplierDelivery', saved, { supplierId: delivery.supplierId, productId: delivery.productId });
  }

  // Movimientos_de_Inventario (24): un ajuste inicial por Producto y una entrada por entrega recibida.
  // La cantidad final de cada Producto es igual al quantityAfter de su último movimiento.
  let entryMovementId = PRODUCTS.length;
  for (const product of PRODUCTS) {
    const receipts = DELIVERIES.filter((delivery) => delivery.productId === product.id && delivery.status === 'recibida').sort(
      (a, b) => a.scheduledInDays - b.scheduledInDays,
    );
    const receivedTotal = receipts.reduce((sum, delivery) => sum + (delivery.quantityReceived ?? 0), 0);
    const initialQuantity = product.quantity - receivedTotal;
    if (initialQuantity < 0) throw new SeedError(`Datos de inventario incoherentes en el producto ${product.id}.`);

    const adjustment = await tx.inventoryMovement.upsert({
      where: { id: product.id },
      create: {
        id: product.id,
        productId: product.id,
        type: 'ajuste',
        quantityBefore: 0,
        quantityAfter: initialQuantity,
        reason: 'Inventario inicial de los datos de demostración.',
        userId: adminId,
        createdAt: initialStockDate,
      },
      update: {},
    });
    assertSame('InventoryMovement', adjustment, { productId: product.id, type: 'ajuste' });

    let running = initialQuantity;
    for (const delivery of receipts) {
      entryMovementId += 1;
      const quantity = delivery.quantityReceived ?? 0;
      const entry = await tx.inventoryMovement.upsert({
        where: { id: entryMovementId },
        create: {
          id: entryMovementId,
          productId: product.id,
          type: 'entrada',
          quantityBefore: running,
          quantityAfter: running + quantity,
          reason: `Recepción de la entrega ${delivery.id} del proveedor.`,
          userId: adminId,
          deliveryId: delivery.id,
          createdAt: shiftDays(reference, delivery.scheduledInDays),
        },
        update: {},
      });
      assertSame('InventoryMovement', entry, { productId: product.id, type: 'entrada' });
      running += quantity;
    }
  }

  // Equipos_Médicos (12) y Registros_de_Mantenimiento (6)
  for (const equipment of EQUIPMENT) {
    const { department, ...fields } = equipment;
    const saved = await tx.equipment.upsert({
      where: { id: equipment.id },
      create: { ...fields, departmentId: departmentId(department) },
      update: {},
    });
    assertSame('Equipment', saved, { name: equipment.name, departmentId: departmentId(department) });
  }
  for (const record of MAINTENANCE_RECORDS) {
    const saved = await tx.maintenanceRecord.upsert({
      where: { id: record.id },
      create: {
        id: record.id,
        equipmentId: record.equipmentId,
        type: record.type,
        startDate: shiftDays(reference, -record.startDaysAgo),
        endDate: record.endDaysAgo === null ? null : shiftDays(reference, -record.endDaysAgo),
        description: record.description,
        technician: record.technician,
        resultingStatus: record.resultingStatus,
      },
      update: {},
    });
    assertSame('MaintenanceRecord', saved, { equipmentId: record.equipmentId, type: record.type });
  }

  // Eventos (6)
  for (const event of EVENTS) {
    const startAt = shiftDays(midnightUtc(shiftDays(reference, event.startInDays)), 0, event.startHour);
    const ownerId = event.owner ? userId(event.owner) : null;
    const saved = await tx.event.upsert({
      where: { id: event.id },
      create: {
        id: event.id,
        title: event.title,
        description: event.description,
        type: event.type,
        startAt,
        endAt: shiftDays(startAt, 0, event.durationHours),
        ownerId,
        // Un Evento personal lo crea su propietario; los demás, el Administrador.
        createdById: ownerId ?? adminId,
      },
      update: {},
    });
    assertSame('Event', saved, { title: event.title });
  }

  // Días_Inhábiles (3), con fecha a las 00:00 UTC
  for (const day of NON_WORKING_DAYS) {
    const date = midnightUtc(shiftDays(reference, day.inDays));
    await tx.nonWorkingDay.upsert({
      where: { date },
      create: { date, title: day.title, description: day.description, createdById: adminId },
      update: {},
    });
  }
}

// ---------- Función principal ----------

export async function runSeed(options: SeedOptions = {}): Promise<SeedResult> {
  const client = options.client ?? sharedClient;
  const documentsDir = options.documentsDir ?? DEFAULT_DOCUMENTS_DIR;

  // 1. Preparación, fuera de la transacción.
  const passwords = await planPasswords(client, options.demoPasswords ?? {}, options.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS);
  const director = await client.user.findUnique({ where: { email: ADMIN_ACCOUNT.email }, select: { createdAt: true } });
  const referenceDate = director?.createdAt ?? options.now ?? new Date();

  const createdFiles: string[] = [];
  try {
    const documents = planDocuments(referenceDate, documentsDir, createdFiles);

    // 2. Escritura atómica.
    await withTransaction(
      async (tx) => {
        await writeSeedData(tx, referenceDate, passwords, documents);
        if (options.beforeCommit) await options.beforeCommit(tx);
      },
      { client, timeoutMs: SEED_TRANSACTION_TIMEOUT_MS, maxWaitMs: 10_000 },
    );
  } catch (error) {
    removeFiles(createdFiles);
    throw error;
  }

  return {
    referenceDate,
    createdFiles,
    credentials: passwords.map((plan) => ({
      email: plan.account.email,
      role: plan.account.role,
      variable: plan.account.variable,
      source: plan.source,
      password: plan.password,
    })),
  };
}

// ---------- Conteos y salida por consola ----------

export async function countSeedData(client: PrismaClient = sharedClient) {
  const [
    departments, users, scheduleSlots, scheduleBreaks, employeeDocuments, patients, patientMovements, treatments,
    rooms, roomAssignments, suppliers, products, medicationInfo, supplierDeliveries, inventoryMovements, equipment,
    maintenanceRecords, events, nonWorkingDays, auditLogs, sessions, passwordResetTokens, adminAuthorizations,
  ] = await Promise.all([
    client.department.count(), client.user.count(), client.scheduleSlot.count(), client.scheduleBreak.count(),
    client.employeeDocument.count(), client.patient.count(), client.patientMovement.count(), client.treatment.count(),
    client.room.count(), client.roomAssignment.count(), client.supplier.count(), client.product.count(),
    client.medicationInfo.count(), client.supplierDelivery.count(), client.inventoryMovement.count(), client.equipment.count(),
    client.maintenanceRecord.count(), client.event.count(), client.nonWorkingDay.count(), client.auditLog.count(),
    client.session.count(), client.passwordResetToken.count(), client.adminAuthorization.count(),
  ]);
  return {
    departments, users, scheduleSlots, scheduleBreaks, employeeDocuments, patients, patientMovements, treatments,
    rooms, roomAssignments, suppliers, products, medicationInfo, supplierDeliveries, inventoryMovements, equipment,
    maintenanceRecords, events, nonWorkingDays, auditLogs, sessions, passwordResetTokens, adminAuthorizations,
  };
}

const SOURCE_LABELS: Record<PasswordSource, string> = {
  variable: 'tomada de la variable',
  generada: 'generada aleatoriamente',
  conservada: 'sin cambios',
};

/** Tabla de credenciales demo. Solo debe mostrarse después de una semilla exitosa. */
export function formatCredentialsTable(credentials: readonly SeedCredential[]): string {
  const rows = credentials.map((credential) => [
    credential.email,
    credential.role,
    credential.password ?? '(se conserva la contraseña existente)',
    `${SOURCE_LABELS[credential.source]} ${credential.variable}`,
  ]);
  const header = ['Correo', 'Rol', 'Contraseña', 'Origen'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => (row[column] ?? '').length)));
  const line = (cells: string[]) => cells.map((cell, column) => cell.padEnd(widths[column] ?? 0)).join('  ');
  return [
    '=== CREDENCIALES DEMO (solo para el entorno de demostración; no las uses en ningún otro sistema) ===',
    line(header),
    line(widths.map((width) => '-'.repeat(width))),
    ...rows.map(line),
    'Las contraseñas generadas se muestran solo esta vez. Guárdalas o define las variables DEMO_*_PASSWORD en backend/.env.',
  ].join('\n');
}
