import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword } from '../../src/lib/password';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

const NOW = new Date('2026-12-01T08:00:00.000Z');
let database: TempDatabase;
let client: PrismaClient;
let app: Express;
let adminCookie: string;
let doctorCookie: string;
let nurseCookie: string;
let cleaningCookie: string;
let password: string;
let doctorId: number;
let patientId: number;

interface Item {
  id: string;
  kind: string;
  severity: string;
  title: string;
  message: string;
  href?: string;
}

async function login(email: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return (response.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('sid='))!.split(';')[0]!;
}

async function notifications(cookie: string): Promise<Item[]> {
  const response = await request(app).get('/api/notifications').set('Cookie', cookie);
  expect(response.status).toBe(200);
  return response.body.data as Item[];
}

beforeAll(async () => {
  database = createTempDatabase('hm-notifications-');
  client = database.client;
  const department = await client.department.create({ data: { name: 'Urgencias' } });
  const otherDepartment = await client.department.create({ data: { name: 'Consulta externa' } });
  password = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password, BCRYPT_TEST_COST);
  const userData = (internalId: string, email: string, role: string, name: string) => ({
    internalId, email, passwordHash, role, name, position: name, specialty: 'General', departmentId: department.id,
    yearsExperience: 5, shift: 'matutino', phone: '5550000000',
  });
  const admin = await client.user.create({ data: userData('ADM-ALT', 'admin-alerts@example.com', 'ADMIN', 'Administrador') });
  const doctor = await client.user.create({ data: userData('DOC-ALT', 'doctor-alerts@example.com', 'DOCTOR', 'Médico Uno') });
  const otherDoctor = await client.user.create({ data: userData('DOC-ALT-2', 'doctor-two-alerts@example.com', 'DOCTOR', 'Médico Dos') });
  const nurse = await client.user.create({ data: userData('ENF-ALT', 'nurse-alerts@example.com', 'NURSE', 'Enfermero') });
  const cleaning = await client.user.create({ data: userData('LIM-ALT', 'cleaning-alerts@example.com', 'CLEANING', 'Limpieza') });
  doctorId = doctor.id;

  const patient = await client.patient.create({ data: {
    internalId: 'PAC-ALT-1', firstName: 'Paciente', lastName: 'De Alertas', birthDate: new Date('1990-01-01T00:00:00Z'),
    sex: 'X', admissionDate: NOW, reason: 'Control médico ficticio', status: 'activo', departmentId: department.id,
    doctorId: doctor.id, nurseId: nurse.id,
  } });
  patientId = patient.id;

  const supplier = await client.supplier.create({ data: { name: 'Proveedor Ficticio', contact: '5550000000' } });
  const medical = await client.product.create({ data: {
    name: 'Gasas ficticias', category: 'material de curación', classification: 'general',
    quantity: 1, minStock: 5, supplierId: supplier.id,
  } });
  await client.product.create({ data: {
    name: 'Desinfectante ficticio', category: 'material de limpieza', classification: 'general',
    quantity: 0, minStock: 3, supplierId: supplier.id,
  } });
  await client.supplierDelivery.create({ data: {
    supplierId: supplier.id, productId: medical.id, quantityRequested: 20,
    scheduledDate: new Date('2026-12-03T10:00:00.000Z'), status: 'programada',
  } });

  await client.treatment.create({ data: {
    patientId: patient.id, type: 'tratamiento', status: 'programado',
    scheduledAt: new Date('2026-12-02T09:00:00.000Z'), description: 'Tratamiento ficticio', createdById: doctor.id,
  } });
  await client.appointment.create({ data: {
    patientId: patient.id, doctorId: doctor.id, scheduledAt: new Date('2026-12-02T10:00:00.000Z'),
    durationMinutes: 30, reason: 'Consulta ficticia', notes: '', status: 'programada', createdById: admin.id,
  } });
  await client.appointment.create({ data: {
    patientId: patient.id, doctorId: otherDoctor.id, scheduledAt: new Date('2026-12-02T11:00:00.000Z'),
    durationMinutes: 30, reason: 'Consulta de otro médico', notes: '', status: 'programada', createdById: admin.id,
  } });

  await client.equipment.create({ data: {
    name: 'Monitor ficticio', category: 'monitoreo', departmentId: department.id, quantity: 1,
    location: 'Urgencias', operationalStatus: 'fuera de servicio', maintenanceRequired: true,
  } });

  const fullRoom = await client.room.create({ data: { number: 101, departmentId: department.id, capacity: 1 } });
  await client.roomAssignment.create({ data: { roomId: fullRoom.id, patientId: patient.id, startedAt: NOW } });
  await client.room.create({ data: { number: 201, departmentId: otherDepartment.id, capacity: 2 } });

  app = createApp({
    corsOrigin: 'http://localhost:5173', sessionSecret: randomBytes(32).toString('base64url'), db: client,
    now: () => new Date(NOW), bcryptCost: BCRYPT_TEST_COST, logError: () => undefined,
  });
  adminCookie = await login(admin.email);
  doctorCookie = await login(doctor.email);
  nurseCookie = await login(nurse.email);
  cleaningCookie = await login(cleaning.email);
}, 60_000);

afterAll(async () => { await database.cleanup(); });

describe('Centro de alertas', () => {
  it('el ADMIN recibe inventario, citas, tratamientos, equipos, entregas y disponibilidad', async () => {
    const items = await notifications(adminCookie);
    const kinds = new Set(items.map((item) => item.kind));
    for (const kind of ['stock', 'appointment', 'treatment', 'equipment', 'delivery', 'room']) expect(kinds).toContain(kind);
    expect(items.filter((item) => item.kind === 'appointment')).toHaveLength(2);
    expect(items.find((item) => item.kind === 'room')).toMatchObject({ severity: 'critical', title: 'Departamento sin disponibilidad', href: '/habitaciones' });
    expect(items.find((item) => item.kind === 'equipment')).toMatchObject({ severity: 'critical', title: 'Equipo fuera de servicio' });
    // Los módulos sin ruta en el Frontend no generan enlaces muertos.
    expect(items.find((item) => item.kind === 'delivery')?.href).toBeUndefined();
    expect(items.find((item) => item.kind === 'equipment')?.href).toBeUndefined();
  });

  it('el DOCTOR solo ve sus citas y los tratamientos de sus pacientes', async () => {
    const items = await notifications(doctorCookie);
    expect(new Set(items.map((item) => item.kind))).toEqual(new Set(['appointment', 'treatment']));
    const appointments = items.filter((item) => item.kind === 'appointment');
    expect(appointments).toHaveLength(1);
    expect(appointments[0]?.message).toContain('Consulta ficticia');
    expect(appointments[0]?.message).not.toContain('otro médico');
    expect(items.every((item) => item.kind !== 'stock' && item.kind !== 'equipment' && item.kind !== 'room')).toBe(true);
    expect(items.find((item) => item.kind === 'treatment')?.href).toBe(`/pacientes/${patientId}`);
  });

  it('el NURSE solo ve tratamientos y nunca citas ni datos de inventario', async () => {
    const items = await notifications(nurseCookie);
    expect(new Set(items.map((item) => item.kind))).toEqual(new Set(['treatment']));
    expect(items.every((item) => !item.message.includes('Consulta ficticia'))).toBe(true);
  });

  it('CLEANING solo ve stock de limpieza y sin enlaces a módulos ocultos', async () => {
    const items = await notifications(cleaningCookie);
    expect(new Set(items.map((item) => item.kind))).toEqual(new Set(['stock']));
    expect(items).toHaveLength(1);
    expect(items[0]?.message).toContain('Desinfectante ficticio');
    expect(items[0]?.href).toBeUndefined();
  });

  it('todos los enlaces corresponden a rutas existentes del Frontend', async () => {
    const allowed = new Set(['/inventario', '/citas', '/habitaciones', `/pacientes/${patientId}`]);
    for (const item of await notifications(adminCookie)) {
      if (item.href !== undefined) expect(allowed).toContain(item.href);
    }
  });
});
