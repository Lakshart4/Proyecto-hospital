// Verificación de la semilla (tarea 2.3).
// Cada grupo usa su propia base SQLite temporal y su propia carpeta temporal de documentos;
// nunca toca prisma/dev.db ni storage/documents. bcrypt usa costo 4 para acelerar las pruebas.

import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SeedError, countSeedData, formatCredentialsTable, runSeed, type SeedResult } from '../../prisma/seed/run-seed';
import { passwordHashFormat, verifyPassword } from '../../src/lib/password';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

const ROUNDS = 4;
const NOW = new Date(Date.UTC(2030, 0, 15, 12, 0, 0));

/** Contraseñas de prueba generadas en cada ejecución: ninguna queda escrita en el código. */
const randomPassword = () => randomBytes(12).toString('base64url');
const DOCTOR_1_PASSWORD = randomPassword();
const REPEATED_PASSWORD = randomPassword();
const DAY_MS = 86_400_000;

const EXPECTED_COUNTS = {
  departments: 6, users: 11, scheduleSlots: 50, scheduleBreaks: 100, employeeDocuments: 20, patients: 12,
  patientMovements: 17, treatments: 14, rooms: 20, roomAssignments: 11, suppliers: 4, products: 20, medicationInfo: 7,
  supplierDeliveries: 8, inventoryMovements: 24, equipment: 12, maintenanceRecords: 6, events: 6, nonWorkingDays: 3,
  auditLogs: 0, sessions: 0, passwordResetTokens: 0, adminAuthorizations: 0,
};

/** Las 11 cuentas aprobadas, escritas aquí de forma independiente de los datos de la semilla. */
const EXPECTED_ACCOUNTS = [
  ['ADM-001', 'director@example.com', 'ADMIN', 'Medicina Interna', 'matutino'],
  ['EMP-001', 'medico1@example.com', 'DOCTOR', 'Urgencias', 'matutino'],
  ['EMP-002', 'medico2@example.com', 'DOCTOR', 'Cardiología', 'vespertino'],
  ['EMP-003', 'medico3@example.com', 'DOCTOR', 'Pediatría', 'matutino'],
  ['EMP-004', 'enfermero1@example.com', 'NURSE', 'Urgencias', 'matutino'],
  ['EMP-005', 'enfermero2@example.com', 'NURSE', 'Cardiología', 'vespertino'],
  ['EMP-006', 'enfermero3@example.com', 'NURSE', 'Cirugía', 'matutino'],
  ['EMP-007', 'enfermero4@example.com', 'NURSE', 'Medicina Interna', 'vespertino'],
  ['EMP-008', 'limpieza1@example.com', 'CLEANING', 'Urgencias', 'matutino'],
  ['EMP-009', 'limpieza2@example.com', 'CLEANING', 'Pediatría', 'vespertino'],
  ['EMP-010', 'limpieza3@example.com', 'CLEANING', 'Radiología', 'vespertino'],
];

function countBy<T>(items: readonly T[], key: (item: T) => string): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
}

async function snapshot(client: PrismaClient) {
  const byId = { orderBy: { id: 'asc' as const } };
  return {
    departments: await client.department.findMany(byId),
    users: await client.user.findMany(byId),
    scheduleSlots: await client.scheduleSlot.findMany(byId),
    scheduleBreaks: await client.scheduleBreak.findMany(byId),
    employeeDocuments: await client.employeeDocument.findMany(byId),
    patients: await client.patient.findMany(byId),
    patientMovements: await client.patientMovement.findMany(byId),
    treatments: await client.treatment.findMany(byId),
    rooms: await client.room.findMany(byId),
    roomAssignments: await client.roomAssignment.findMany(byId),
    suppliers: await client.supplier.findMany(byId),
    products: await client.product.findMany(byId),
    medicationInfo: await client.medicationInfo.findMany({ orderBy: { productId: 'asc' } }),
    supplierDeliveries: await client.supplierDelivery.findMany(byId),
    inventoryMovements: await client.inventoryMovement.findMany(byId),
    equipment: await client.equipment.findMany(byId),
    maintenanceRecords: await client.maintenanceRecord.findMany(byId),
    events: await client.event.findMany(byId),
    nonWorkingDays: await client.nonWorkingDay.findMany(byId),
  };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

// ============================================================
// Base sembrada: contenido, contraseñas e idempotencia
// ============================================================

describe('Semilla: base nueva', () => {
  let db: TempDatabase | undefined;
  let client: PrismaClient;
  let documentsDir = '';
  let first: SeedResult;

  beforeAll(async () => {
    db = createTempDatabase('hm-seed-');
    client = db.client;
    documentsDir = mkdtempSync(join(tmpdir(), 'hm-seed-docs-'));
    first = await runSeed({ client, documentsDir, bcryptRounds: ROUNDS, now: NOW });
  }, 120_000);

  afterAll(async () => {
    await db?.cleanup();
    if (documentsDir) rmSync(documentsDir, { recursive: true, force: true });
  });

  it('crea exactamente las cantidades esperadas de cada modelo y ningún registro de auditoría', async () => {
    expect(await countSeedData(client)).toEqual(EXPECTED_COUNTS);
    expect(first.referenceDate.toISOString()).toBe(NOW.toISOString());
  });

  it('crea las 11 cuentas aprobadas: 1 ADMIN y 10 Empleados (3 DOCTOR, 4 NURSE, 3 CLEANING; 5 por Turno)', async () => {
    const users = await client.user.findMany({ include: { department: true }, orderBy: { internalId: 'asc' } });
    expect(users.map((u) => [u.internalId, u.email, u.role, u.department.name, u.shift])).toEqual(EXPECTED_ACCOUNTS);

    const admin = users.find((u) => u.role === 'ADMIN');
    expect(admin?.specialty).toBe('Administración hospitalaria');

    const employees = users.filter((u) => u.role !== 'ADMIN');
    expect(employees).toHaveLength(10);
    expect(countBy(employees, (u) => u.role)).toEqual({ DOCTOR: 3, NURSE: 4, CLEANING: 3 });
    expect(countBy(employees, (u) => u.shift)).toEqual({ matutino: 5, vespertino: 5 });
    expect(users.every((u) => u.mustChangePassword === false && u.active)).toBe(true);
    expect(users.every((u) => u.email.endsWith('@example.com'))).toBe(true);
  });

  it('crea 50 franjas de lunes a viernes con comida y Descansos válidos, solo para los Empleados', async () => {
    const slots = await client.scheduleSlot.findMany({ include: { user: true, breaks: true } });
    expect(slots).toHaveLength(50);
    expect(slots.some((s) => s.user.role === 'ADMIN')).toBe(false);
    for (const [, userSlots] of Object.entries(countBy(slots, (s) => String(s.userId)))) expect(userSlots).toBe(5);
    for (const slot of slots) {
      expect([1, 2, 3, 4, 5]).toContain(slot.dayOfWeek);
      expect(slot.mealStart && slot.mealEnd).toBeTruthy();
      expect(slot.startTime < (slot.mealStart ?? '') && (slot.mealEnd ?? '') < slot.endTime).toBe(true);
      expect(slot.breaks).toHaveLength(2);
      for (const pause of slot.breaks) {
        expect(slot.startTime <= pause.startTime && pause.endTime <= slot.endTime).toBe(true);
        const overlapsMeal = pause.startTime < (slot.mealEnd ?? '') && (slot.mealStart ?? '') < pause.endTime;
        expect(overlapsMeal).toBe(false);
      }
    }
  });

  it('crea 20 documentos (contratación y acreditación por Empleado) con PDF válidos en la carpeta privada', async () => {
    const docs = await client.employeeDocument.findMany({ include: { user: true } });
    expect(docs).toHaveLength(20);
    expect(docs.some((d) => d.user.role === 'ADMIN')).toBe(false);
    for (const [, types] of Object.entries(countBy(docs, (d) => `${d.userId}:${d.type}`))) expect(types).toBe(1);
    expect(countBy(docs, (d) => d.type)).toEqual({ contratación: 10, acreditación: 10 });

    expect(first.createdFiles).toHaveLength(20);
    expect(listFiles(documentsDir)).toHaveLength(20);
    for (const doc of docs) {
      expect(doc.filePath.startsWith('seed/') && !doc.filePath.includes('..')).toBe(true);
      const content = readFileSync(join(documentsDir, ...doc.filePath.split('/')));
      expect(content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
      expect(content.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
      expect(content.length).toBe(doc.fileSize);
      expect(doc.issuedAt.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (doc.expiresAt) expect(doc.expiresAt.getTime()).toBeGreaterThanOrEqual(doc.issuedAt.getTime());
    }
  });

  it('crea Pacientes, movimientos, Asignaciones y Tratamientos coherentes', async () => {
    const patients = await client.patient.findMany({ include: { assignments: { include: { room: true } }, movements: true } });
    expect(countBy(patients, (p) => p.status)).toEqual({ activo: 7, 'dado de alta': 3, fallecido: 2 });
    expect(countBy(await client.patientMovement.findMany(), (m) => m.type)).toEqual({ ingreso: 12, alta: 3, fallecimiento: 2 });

    for (const patient of patients) {
      expect(patient.admissionDate.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(patient.deceasedAt !== null).toBe(patient.status === 'fallecido');
      if (patient.deceasedAt) expect(patient.deceasedAt.getTime()).toBeGreaterThanOrEqual(patient.admissionDate.getTime());
      const active = patient.assignments.filter((a) => a.endedAt === null);
      expect(active.length).toBeLessThanOrEqual(1);
      if (patient.status !== 'activo') expect(active).toHaveLength(0);
      for (const assignment of patient.assignments) {
        expect(assignment.room.departmentId).toBe(patient.departmentId);
        expect(assignment.releaseReason === null).toBe(assignment.endedAt === null);
      }
    }

    const assignments = await client.roomAssignment.findMany({ include: { room: true } });
    const closed = assignments.filter((a) => a.endedAt !== null);
    expect(closed).toHaveLength(5);
    expect(countBy(closed, (a) => a.releaseReason ?? '')).toEqual({ alta: 3, fallecimiento: 2 });
    const activeByRoom = countBy(assignments.filter((a) => a.endedAt === null), (a) => String(a.roomId));
    for (const room of await client.room.findMany()) {
      expect(activeByRoom[String(room.id)] ?? 0).toBeLessThanOrEqual(room.capacity);
      expect(room.capacity >= 1 && room.capacity <= 10).toBe(true);
    }
    expect(new Set((await client.room.findMany()).map((r) => r.departmentId)).size).toBe(6);

    const staff = await client.user.findMany({ where: { role: { in: ['DOCTOR', 'NURSE'] } } });
    for (const member of staff) {
      const activeCount = patients.filter(
        (p) => p.status === 'activo' && (member.role === 'DOCTOR' ? p.doctorId : p.nurseId) === member.id,
      ).length;
      expect(activeCount, `${member.email} sin Pacientes activos`).toBeGreaterThanOrEqual(1);
    }
    for (const patient of patients) {
      const doctor = staff.find((u) => u.id === patient.doctorId);
      const nurse = staff.find((u) => u.id === patient.nurseId);
      expect(doctor?.role).toBe('DOCTOR');
      expect(nurse?.role).toBe('NURSE');
    }

    const treatments = await client.treatment.findMany();
    expect(treatments.length).toBeGreaterThanOrEqual(12);
    expect(treatments.filter((t) => t.type === 'cirugía').length).toBeGreaterThanOrEqual(2);
    expect(treatments.filter((t) => t.status === 'realizado').length).toBeGreaterThanOrEqual(2);
    for (const t of treatments) expect(t.performedAt !== null).toBe(t.status === 'realizado');
  });

  it('crea 4 Proveedores y un inventario coherente con sus 24 movimientos', async () => {
    const suppliers = await client.supplier.findMany({ include: { products: true } });
    expect(suppliers).toHaveLength(4);
    const categoriesBySupplier = suppliers.map((s) => [...new Set(s.products.map((p) => p.category))].join(','));
    expect(categoriesBySupplier.sort()).toEqual(['insumo médico', 'material de limpieza', 'medicamento', 'medicamento']);

    const products = await client.product.findMany({ include: { medicationInfo: true, movements: { orderBy: { id: 'asc' } } } });
    const byCategory = countBy(products, (p) => p.category);
    expect(byCategory).toEqual({ 'insumo médico': 7, medicamento: 7, 'material de limpieza': 6 });
    for (const product of products) {
      expect(product.medicationInfo !== null).toBe(product.category === 'medicamento');
      if (product.medicationInfo?.type === 'de patente') expect(product.medicationInfo.tradeName).toBeTruthy();
      if (['receta simple', 'receta retenida', 'controlado'].includes(product.medicationInfo?.controlClass ?? '')) {
        expect(product.medicationInfo?.requiresPrescription).toBe(true);
      }
      if (product.medicationInfo?.controlClass === 'venta libre') expect(product.medicationInfo.requiresPrescription).toBe(false);
      expect(product.movements[0]?.type).toBe('ajuste');
      expect(product.movements[0]?.quantityBefore).toBe(0);
      expect(product.movements.at(-1)?.quantityAfter).toBe(product.quantity);
    }
    expect(products.filter((p) => p.quantity === 0)).toHaveLength(1);
    const outOfStock = products.find((p) => p.quantity === 0);
    expect(outOfStock?.movements.map((m) => [m.type, m.quantityBefore, m.quantityAfter])).toEqual([['ajuste', 0, 0]]);
    expect(products.some((p) => p.category !== 'material de limpieza' && p.quantity <= p.minStock)).toBe(true);
    expect(products.some((p) => p.category === 'material de limpieza' && p.quantity <= p.minStock)).toBe(true);

    expect(countBy(await client.inventoryMovement.findMany(), (m) => m.type)).toEqual({ ajuste: 20, entrada: 4 });

    const deliveries = await client.supplierDelivery.findMany({ include: { product: true, movement: true } });
    expect(countBy(deliveries, (d) => d.status)).toEqual({ recibida: 4, programada: 3, cancelada: 1 });
    for (const delivery of deliveries) {
      expect(delivery.supplierId).toBe(delivery.product.supplierId);
      expect(delivery.movement !== null).toBe(delivery.status === 'recibida');
      if (delivery.movement) expect(delivery.movement.quantityAfter - delivery.movement.quantityBefore).toBe(delivery.quantityReceived);
    }
    const upcoming = deliveries.filter(
      (d) => d.status === 'programada' && d.scheduledDate.getTime() >= NOW.getTime() && d.scheduledDate.getTime() <= NOW.getTime() + 7 * DAY_MS,
    );
    expect(upcoming.length).toBeGreaterThanOrEqual(1);
  });

  it('crea 12 equipos (todos los Departamentos y Estados_Operativos) y 6 mantenimientos (4 cerrados, 2 en curso)', async () => {
    const equipment = await client.equipment.findMany({ include: { maintenanceRecords: true } });
    expect(new Set(equipment.map((e) => e.departmentId)).size).toBe(6);
    expect(Object.keys(countBy(equipment, (e) => e.operationalStatus)).sort()).toEqual(
      ['disponible', 'en mantenimiento', 'en uso', 'fuera de servicio'],
    );
    const records = equipment.flatMap((e) => e.maintenanceRecords.map((r) => ({ ...r, status: e.operationalStatus })));
    expect(records.filter((r) => r.endDate === null)).toHaveLength(2);
    expect(records.filter((r) => r.endDate !== null)).toHaveLength(4);
    for (const record of records) {
      expect(record.startDate.getTime()).toBeLessThanOrEqual(NOW.getTime());
      if (record.endDate === null) expect(record.status).toBe('en mantenimiento');
      else expect(record.endDate.getTime()).toBeGreaterThanOrEqual(record.startDate.getTime());
    }
    for (const item of equipment) expect(item.maintenanceRecords.filter((r) => r.endDate === null).length).toBeLessThanOrEqual(1);
  });

  it('crea 6 eventos (2 generales, 2 actividades, 1 entrega, 1 agenda de medico1) y 3 Días_Inhábiles a medianoche UTC', async () => {
    const events = await client.event.findMany({ include: { owner: true, createdBy: true } });
    expect(countBy(events, (e) => e.type)).toEqual({ general: 2, actividad: 2, entrega: 1, 'agenda individual': 1 });
    const personal = events.find((e) => e.type === 'agenda individual');
    expect(personal?.owner?.email).toBe('medico1@example.com');
    expect(personal?.createdBy.email).toBe('medico1@example.com');
    for (const event of events.filter((e) => e.type !== 'agenda individual')) {
      expect(event.ownerId).toBeNull();
      expect(event.createdBy.role).toBe('ADMIN');
    }
    for (const event of events) expect(event.endAt.getTime()).toBeGreaterThanOrEqual(event.startAt.getTime());
    const soon = events.filter(
      (e) => e.type === 'actividad' && e.startAt.getTime() >= NOW.getTime() && e.startAt.getTime() <= NOW.getTime() + 7 * DAY_MS,
    );
    expect(soon).toHaveLength(1);

    const days = await client.nonWorkingDay.findMany();
    expect(days).toHaveLength(3);
    for (const day of days) {
      expect(day.date.getUTCHours() + day.date.getUTCMinutes() + day.date.getUTCSeconds() + day.date.getUTCMilliseconds()).toBe(0);
    }
  });

  it('guarda solo hashes en el formato nuevo (bcrypt sobre SHA-256): 11 contraseñas distintas que no aparecen en la base de datos', async () => {
    expect(first.credentials).toHaveLength(11);
    expect(first.credentials.every((c) => c.source === 'generada' && c.password?.length === 16)).toBe(true);
    const passwords = first.credentials.map((c) => c.password as string);
    expect(new Set(passwords).size).toBe(11);

    const users = await client.user.findMany();
    for (const credential of first.credentials) {
      const user = users.find((u) => u.email === credential.email);
      expect(passwordHashFormat(user?.passwordHash ?? '')).toBe('bcrypt-sha256');
      expect(user?.passwordHash).not.toContain(credential.password as string);
      expect(await verifyPassword(credential.password as string, user?.passwordHash ?? '')).toBe(true);
    }

    const dbFile = readFileSync((db as TempDatabase).url.replace(/^file:/, '')).toString('latin1');
    for (const password of passwords) expect(dbFile.includes(password)).toBe(false);

    const table = formatCredentialsTable(first.credentials);
    expect(table).toContain('CREDENCIALES DEMO');
    for (const credential of first.credentials) expect(table).toContain(credential.email);
  });

  it('es idempotente: la segunda ejecución no crea, modifica ni reescribe nada y conserva las contraseñas', async () => {
    const before = await snapshot(client);
    const second = await runSeed({ client, documentsDir, bcryptRounds: ROUNDS, now: new Date(NOW.getTime() + 40 * DAY_MS) });
    expect(await countSeedData(client)).toEqual(EXPECTED_COUNTS);
    expect(await snapshot(client)).toEqual(before);
    expect(second.referenceDate.toISOString()).toBe(NOW.toISOString());
    expect(second.createdFiles).toEqual([]);
    expect(second.credentials.every((c) => c.source === 'conservada' && c.password === null)).toBe(true);
    expect(listFiles(documentsDir)).toHaveLength(20);
  });

  it('actualiza solo la contraseña de la cuenta cuya variable está definida', async () => {
    const before = await snapshot(client);
    const result = await runSeed({
      client, documentsDir, bcryptRounds: ROUNDS, demoPasswords: { DEMO_DOCTOR_1_PASSWORD: DOCTOR_1_PASSWORD },
    });
    const after = await snapshot(client);

    const changed = after.users.filter((user, index) => user.passwordHash !== before.users[index]?.passwordHash);
    expect(changed.map((u) => u.email)).toEqual(['medico1@example.com']);
    expect(passwordHashFormat(changed[0]?.passwordHash ?? '')).toBe('bcrypt-sha256');
    expect(await verifyPassword(DOCTOR_1_PASSWORD, changed[0]?.passwordHash ?? '')).toBe(true);
    expect(result.credentials.filter((c) => c.source === 'variable').map((c) => c.variable)).toEqual(['DEMO_DOCTOR_1_PASSWORD']);
    expect(result.credentials.filter((c) => c.source === 'conservada')).toHaveLength(10);

    const { users: _usersAfter, ...restAfter } = after;
    const { users: _usersBefore, ...restBefore } = before;
    expect(restAfter).toEqual(restBefore);
    expect(await countSeedData(client)).toEqual(EXPECTED_COUNTS);
  });

  it('rechaza contraseñas repetidas sin mostrarlas y sin escribir nada', async () => {
    const before = await snapshot(client);

    const duplicated = runSeed({
      client, documentsDir, bcryptRounds: ROUNDS,
      demoPasswords: { DEMO_NURSE_1_PASSWORD: REPEATED_PASSWORD, DEMO_NURSE_2_PASSWORD: REPEATED_PASSWORD },
    });
    await expect(duplicated).rejects.toBeInstanceOf(SeedError);
    await expect(duplicated).rejects.toThrow(/DEMO_NURSE_1_PASSWORD = DEMO_NURSE_2_PASSWORD/);
    await duplicated.catch((error: Error) => expect(error.message).not.toContain(REPEATED_PASSWORD));

    const matchesKept = runSeed({
      client, documentsDir, bcryptRounds: ROUNDS, demoPasswords: { DEMO_NURSE_3_PASSWORD: DOCTOR_1_PASSWORD },
    });
    await expect(matchesKept).rejects.toThrow(/DEMO_NURSE_3_PASSWORD.*medico1@example\.com/);
    await matchesKept.catch((error: Error) => expect(error.message).not.toContain(DOCTOR_1_PASSWORD));

    expect(await snapshot(client)).toEqual(before);
  });

  it('conserva y sigue verificando un hash bcrypt clásico de una cuenta existente (compatibilidad)', async () => {
    // Una cuenta creada antes del formato nuevo: su hash bcrypt clásico se genera aquí, en ejecución.
    const legacyPassword = randomPassword();
    const legacyHash = await bcrypt.hash(legacyPassword, ROUNDS);
    expect(passwordHashFormat(legacyHash)).toBe('bcrypt-legacy');
    await client.user.update({ where: { email: 'medico2@example.com' }, data: { passwordHash: legacyHash } });
    const before = await snapshot(client);

    // Sin variable: la semilla conserva el hash tal cual y la contraseña sigue verificando.
    const kept = await runSeed({ client, documentsDir, bcryptRounds: ROUNDS });
    expect(kept.credentials.find((c) => c.email === 'medico2@example.com')?.source).toBe('conservada');
    expect(await snapshot(client)).toEqual(before);
    expect(await verifyPassword(legacyPassword, legacyHash)).toBe(true);

    // La comparación con contraseñas conservadas también reconoce el formato clásico.
    const matchesLegacy = runSeed({ client, documentsDir, bcryptRounds: ROUNDS, demoPasswords: { DEMO_NURSE_3_PASSWORD: legacyPassword } });
    await expect(matchesLegacy).rejects.toThrow(/DEMO_NURSE_3_PASSWORD.*medico2@example\.com/);
    expect(await snapshot(client)).toEqual(before);

    // Con su variable definida, la cuenta pasa al formato nuevo con esa contraseña.
    await runSeed({ client, documentsDir, bcryptRounds: ROUNDS, demoPasswords: { DEMO_DOCTOR_2_PASSWORD: legacyPassword } });
    const updated = await client.user.findUniqueOrThrow({ where: { email: 'medico2@example.com' } });
    expect(passwordHashFormat(updated.passwordHash)).toBe('bcrypt-sha256');
    expect(await verifyPassword(legacyPassword, updated.passwordHash)).toBe(true);
  });
});

// ============================================================
// Fallo durante la transacción: reversión y limpieza de archivos
// ============================================================

describe('Semilla: fallo forzado', () => {
  let db: TempDatabase | undefined;
  let documentsDir = '';

  beforeAll(() => {
    db = createTempDatabase('hm-seed-fail-');
    documentsDir = mkdtempSync(join(tmpdir(), 'hm-seed-fail-docs-'));
  }, 120_000);

  afterAll(async () => {
    await db?.cleanup();
    if (documentsDir) rmSync(documentsDir, { recursive: true, force: true });
  });

  it('revierte todos los registros y borra solo los PDF creados en esa ejecución', async () => {
    const client = (db as TempDatabase).client;
    const preexisting = join(documentsDir, 'seed', 'EMP-001-contratacion.pdf');
    mkdirSync(join(documentsDir, 'seed'), { recursive: true });
    writeFileSync(preexisting, 'ARCHIVO PREEXISTENTE');

    await expect(
      runSeed({
        client, documentsDir, bcryptRounds: ROUNDS, now: NOW,
        beforeCommit: async () => {
          throw new Error('Fallo forzado al final de la transacción');
        },
      }),
    ).rejects.toThrow('Fallo forzado al final de la transacción');

    const counts = await countSeedData(client);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
    expect(listFiles(documentsDir)).toEqual([preexisting]);
    expect(readFileSync(preexisting, 'utf8')).toBe('ARCHIVO PREEXISTENTE');
  });
});

// ============================================================
// Datos existentes incompatibles
// ============================================================

describe('Semilla: datos existentes incompatibles', () => {
  let db: TempDatabase | undefined;
  let documentsDir = '';

  beforeAll(() => {
    db = createTempDatabase('hm-seed-conflict-');
    documentsDir = mkdtempSync(join(tmpdir(), 'hm-seed-conflict-docs-'));
  }, 120_000);

  afterAll(async () => {
    await db?.cleanup();
    if (documentsDir) rmSync(documentsDir, { recursive: true, force: true });
  });

  it('se detiene sin sobrescribir una cuenta demo existente con otro rol', async () => {
    const client = (db as TempDatabase).client;
    const department = await client.department.create({ data: { name: 'Urgencias' } });
    const user = await client.user.create({
      data: {
        internalId: 'ADM-001', email: 'director@example.com', passwordHash: 'hash-previo', role: 'DOCTOR', name: 'Previo',
        position: 'Cargo', specialty: 'Especialidad', departmentId: department.id, yearsExperience: 1, shift: 'matutino', phone: '1',
      },
    });

    await expect(runSeed({ client, documentsDir, bcryptRounds: ROUNDS, now: NOW })).rejects.toThrow(/director@example\.com/);
    expect(await client.user.findUniqueOrThrow({ where: { id: user.id } })).toEqual(user);
    expect(await client.user.count()).toBe(1);
    expect(listFiles(documentsDir)).toEqual([]);
  });

  it('se detiene si un registro con ID fijo de la semilla ya existe con otros datos', async () => {
    const client = (db as TempDatabase).client;
    await client.user.deleteMany();
    await client.supplier.create({ data: { id: 3, name: 'Proveedor creado por un usuario', contact: 'x@example.com' } });

    await expect(runSeed({ client, documentsDir, bcryptRounds: ROUNDS, now: NOW })).rejects.toThrow(/Supplier con id 3/);
    expect(await client.user.count()).toBe(0);
    expect(await client.supplier.count()).toBe(1);
    expect(listFiles(documentsDir)).toEqual([]);
  });
});
