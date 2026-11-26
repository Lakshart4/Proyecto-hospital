import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword } from '../../src/lib/password';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

let database: TempDatabase;
let client: PrismaClient;
let app: Express;
let cookie: string;

beforeAll(async () => {
  database = createTempDatabase('hm-reports-');
  client = database.client;
  const department = await client.department.create({ data: { name: 'Medicina Interna' } });
  const password = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password, BCRYPT_TEST_COST);
  const user = await client.user.create({ data: {
    internalId: 'ADM-REP', email: 'admin-reports@example.com', passwordHash, role: 'ADMIN', name: 'Administrador',
    position: 'Dirección', specialty: 'General', departmentId: department.id, yearsExperience: 5, shift: 'matutino', phone: '5550000000',
  } });
  const patient = await client.patient.create({ data: {
    internalId: 'PAC-REP', firstName: 'Paciente', lastName: 'Reporte', birthDate: new Date('1980-01-01T00:00:00Z'), sex: 'X',
    admissionDate: new Date('2026-12-02T10:00:00Z'), reason: 'Control ficticio', status: 'dado de alta', departmentId: department.id,
    doctorId: user.id, nurseId: user.id,
  } });
  await client.patientMovement.create({ data: { patientId: patient.id, type: 'ingreso', occurredAt: new Date('2026-12-02T10:00:00Z'), departmentId: department.id, userId: user.id } });
  await client.patientMovement.create({ data: { patientId: patient.id, type: 'alta', occurredAt: new Date('2026-12-03T10:00:00Z'), departmentId: department.id, userId: user.id } });
  await client.treatment.create({ data: { patientId: patient.id, type: 'cirugía', status: 'realizado', scheduledAt: new Date('2026-12-04T10:00:00Z'), performedAt: new Date('2026-12-04T12:00:00Z'), description: 'Procedimiento ficticio', createdById: user.id } });
  const supplier = await client.supplier.create({ data: { name: 'Proveedor', contact: 'contacto@example.com' } });
  const product = await client.product.create({ data: { name: 'Insumo', category: 'insumo médico', classification: 'material médico', quantity: 5, minStock: 1, supplierId: supplier.id } });
  await client.inventoryMovement.create({ data: { productId: product.id, type: 'entrada', quantityBefore: 0, quantityAfter: 10, reason: 'Entrada', userId: user.id, createdAt: new Date('2026-12-05T10:00:00Z') } });
  await client.inventoryMovement.create({ data: { productId: product.id, type: 'salida', quantityBefore: 10, quantityAfter: 6, reason: 'Salida', userId: user.id, createdAt: new Date('2026-12-06T10:00:00Z') } });
  await client.inventoryMovement.create({ data: { productId: product.id, type: 'ajuste', quantityBefore: 6, quantityAfter: 5, reason: 'Ajuste', userId: user.id, createdAt: new Date('2026-12-07T10:00:00Z') } });
  await client.supplierDelivery.create({ data: { supplierId: supplier.id, productId: product.id, quantityRequested: 10, quantityReceived: 10, scheduledDate: new Date('2026-12-05T09:00:00Z'), receivedDate: new Date('2026-12-05T10:00:00Z'), status: 'recibida' } });
  const room = await client.room.create({ data: { number: 101, departmentId: department.id, capacity: 1 } });
  await client.roomAssignment.create({ data: { roomId: room.id, patientId: patient.id, startedAt: new Date('2026-12-02T11:00:00Z') } });
  app = createApp({ corsOrigin: 'http://localhost:5173', sessionSecret: randomBytes(32).toString('base64url'), db: client, bcryptCost: BCRYPT_TEST_COST, logError: () => undefined });
  const login = await request(app).post('/api/auth/login').send({ email: user.email, password });
  cookie = (login.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('sid='))!.split(';')[0]!;
}, 60_000);

afterAll(async () => { await database.cleanup(); });

describe('Reportes institucionales', () => {
  it('calcula actividad, pacientes y ocupación reales en un rango inclusivo', async () => {
    const response = await request(app).get('/api/reports/summary').set('Cookie', cookie).query({ from: '2026-12-01', to: '2026-12-31' });
    expect(response.status).toBe(200);
    expect(response.body.data.activity).toEqual({
      admissions: 1, discharges: 1, deaths: 0, treatmentsPerformed: 1, surgeriesScheduled: 1,
      inventoryEntries: 1, inventoryExits: 1, inventoryAdjustments: 1, deliveriesReceived: 1,
    });
    expect(response.body.data.patients).toEqual({ active: 0, discharged: 1, deceased: 0 });
    expect(response.body.data.occupancy[0]).toMatchObject({ department: 'Medicina Interna', rooms: 1, occupiedRooms: 1, activeAssignments: 1, capacity: 1 });
  });

  it('rechaza rangos inválidos', async () => {
    const response = await request(app).get('/api/reports/summary').set('Cookie', cookie).query({ from: '2026-12-31', to: '2026-12-01' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_ERROR');
  });
});
