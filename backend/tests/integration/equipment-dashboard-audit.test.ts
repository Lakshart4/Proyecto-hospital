// Integración de Equipos/Mantenimiento, Dashboard y consulta de Auditoría (tareas 6.19, 6.23 y 6.24).

import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword } from '../../src/lib/password';
import { createAuditRouter } from '../../src/routes/audit.routes';
import { createDashboardRouter } from '../../src/routes/dashboard.routes';
import { createEquipmentRouter } from '../../src/routes/equipment.routes';
import { createAuditService } from '../../src/services/audit.service';
import { createDashboardService } from '../../src/services/dashboard.service';
import { createEquipmentService } from '../../src/services/equipment.service';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

const NOW = new Date('2026-06-10T12:00:00Z');
let database: TempDatabase | undefined;
let client: PrismaClient;
let app: Express;
let departmentId: number;
let adminId: number;
let equipmentId: number;
let maintenanceId: number;
let adminCookie: string;
let doctorCookie: string;

async function login(email: string, password: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  const header = response.headers['set-cookie'] as unknown;
  const cookies = Array.isArray(header) ? header as string[] : [String(header)];
  const cookie = cookies.find((value) => value.startsWith('sid='));
  if (!cookie) throw new Error('No se recibió la cookie de sesión.');
  return cookie.split(';')[0] as string;
}

beforeAll(async () => {
  database = createTempDatabase('hm-equipment-dashboard-audit-');
  client = database.client;
  const department = await client.department.create({ data: { name: 'Equipos y tablero' } });
  departmentId = department.id;
  const passwordHash = await hashPassword('Clave-de-prueba-123', BCRYPT_TEST_COST);
  const admin = await client.user.create({
    data: {
      internalId: 'ADMIN-T', email: 'admin-modules@example.com', passwordHash, role: 'ADMIN', name: 'Administradora',
      position: 'Dirección', specialty: 'General', departmentId, yearsExperience: 5, shift: 'matutino', phone: '5550000001',
    },
  });
  adminId = admin.id;
  await client.user.create({
    data: {
      internalId: 'DOC-T', email: 'doctor-modules@example.com', passwordHash, role: 'DOCTOR', name: 'Médico',
      position: 'Médico', specialty: 'General', departmentId, yearsExperience: 5, shift: 'matutino', phone: '5550000002',
    },
  });

  const now = () => new Date(NOW.getTime());
  app = createApp({
    corsOrigin: 'http://localhost:5173',
    sessionSecret: 'secreto-de-pruebas-de-integracion-32-caracteres',
    db: client,
    bcryptCost: BCRYPT_TEST_COST,
    logError: () => undefined,
    extraRoutes: (router, security) => {
      router.use(createEquipmentRouter({ service: createEquipmentService({ db: client, now }), security }));
      router.use(createDashboardRouter({ service: createDashboardService({ db: client, now }), security }));
      router.use(createAuditRouter({ service: createAuditService({ db: client }), security }));
    },
  });
  adminCookie = await login(admin.email, 'Clave-de-prueba-123');
  doctorCookie = await login('doctor-modules@example.com', 'Clave-de-prueba-123');
}, 120_000);

afterAll(async () => {
  await database?.cleanup();
});

const equipmentBody = (quantity = 2) => ({
  name: 'Monitor de signos', category: 'Monitor', departmentId, quantity, location: 'Sala 1',
  operationalStatus: 'disponible', maintenanceRequired: false,
});

describe('Equipos y mantenimiento', () => {
  it.each([0, 10_000])('rechaza cantidad %s y un no ADMIN recibe 403', async (quantity) => {
    const invalid = await request(app).post('/api/equipment').set('Cookie', adminCookie).send(equipmentBody(quantity));
    expect(invalid.status).toBe(400);
    const forbidden = await request(app).get('/api/equipment').set('Cookie', doctorCookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).not.toHaveProperty('data');
  });

  it('crea, filtra, resume y audita apertura/cierre con estados anterior y nuevo', async () => {
    const created = await request(app).post('/api/equipment').set('Cookie', adminCookie).send(equipmentBody());
    expect(created.status).toBe(201);
    equipmentId = created.body.data.id as number;

    const filtered = await request(app).get('/api/equipment').set('Cookie', adminCookie).query({ category: 'Monitor', departmentId, status: 'disponible', search: 'sala' });
    expect(filtered.status).toBe(200);
    expect(filtered.body.data).toHaveLength(1);
    const summary = await request(app).get('/api/equipment/summary').set('Cookie', adminCookie);
    expect(summary.body.data).toMatchObject({ total: 2, byCategory: [{ category: 'Monitor', quantity: 2 }] });

    const opened = await request(app).post('/api/maintenance').set('Cookie', adminCookie).send({
      equipmentId, type: 'correctivo', startDate: '2026-06-01T08:00:00Z', description: 'Revisión completa', technician: 'Técnico Uno',
    });
    expect(opened.status).toBe(201);
    maintenanceId = opened.body.data.id as number;
    expect((await client.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).operationalStatus).toBe('en mantenimiento');

    const duplicate = await request(app).post('/api/maintenance').set('Cookie', adminCookie).send({
      equipmentId, type: 'preventivo', startDate: '2026-06-02T08:00:00Z', description: 'Segundo registro', technician: 'Técnico Dos',
    });
    expect(duplicate.status).toBe(409);

    const list = await request(app).get('/api/maintenance').set('Cookie', adminCookie).query({ equipmentId, open: true, pageSize: 1 });
    expect(list.body).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    const closed = await request(app).post(`/api/maintenance/${maintenanceId}/close`).set('Cookie', adminCookie).send({
      endDate: '2026-06-03T08:00:00Z', resultingStatus: 'fuera de servicio',
    });
    expect(closed.status).toBe(200);
    expect((await client.equipment.findUniqueOrThrow({ where: { id: equipmentId } })).operationalStatus).toBe('fuera de servicio');

    const logs = await client.auditLog.findMany({ where: { action: { in: ['MAINTENANCE_OPEN', 'MAINTENANCE_CLOSE'] } }, orderBy: { id: 'asc' } });
    expect(logs).toHaveLength(2);
    expect(JSON.parse(logs[0]!.details)).toMatchObject({ equipmentId, from: 'disponible', to: 'en mantenimiento' });
    expect(JSON.parse(logs[1]!.details)).toMatchObject({ equipmentId, from: 'en mantenimiento', to: 'fuera de servicio' });
  });
});

describe('Dashboard', () => {
  it('recalcula datos y devuelve solo actividades/entregas de los próximos 7 días', async () => {
    await request(app).patch(`/api/equipment/${equipmentId}/status`).set('Cookie', adminCookie).send({ operationalStatus: 'en mantenimiento' });
    await client.room.create({ data: { number: 101, departmentId, capacity: 1 } });
    const supplier = await client.supplier.create({ data: { name: 'Proveedor', contact: 'contacto@example.com' } });
    const product = await client.product.create({
      data: { name: 'Guantes', category: 'insumo médico', classification: 'material médico', quantity: 0, minStock: 2, supplierId: supplier.id },
    });
    await client.event.create({
      data: { title: 'Actividad próxima', type: 'actividad', startAt: new Date('2026-06-12T09:00:00Z'), endAt: new Date('2026-06-12T10:00:00Z'), createdById: adminId },
    });
    await client.event.create({
      data: { title: 'Actividad lejana', type: 'actividad', startAt: new Date('2026-06-20T09:00:00Z'), endAt: new Date('2026-06-20T10:00:00Z'), createdById: adminId },
    });
    await client.supplierDelivery.create({
      data: { supplierId: supplier.id, productId: product.id, quantityRequested: 4, scheduledDate: new Date('2026-06-11T09:00:00Z'), status: 'programada' },
    });
    await client.supplierDelivery.create({
      data: { supplierId: supplier.id, productId: product.id, quantityRequested: 4, scheduledDate: new Date('2026-06-11T10:00:00Z'), status: 'cancelada' },
    });

    const response = await request(app).get('/api/dashboard').set('Cookie', adminCookie);
    expect(response.status).toBe(200);
    expect(response.body.data.cards).toMatchObject({ employees: 1, availableRooms: 1, lowStockProducts: 1, equipmentInMaintenance: 1 });
    expect(response.body.data.indicators.outOfStockProducts).toBe(1);
    expect(response.body.data.byDepartment).toEqual([{ departmentId, occupied: 0, total: 1, percentage: 0, department: { id: departmentId, name: 'Equipos y tablero' } }]);
    expect(response.body.data.upcoming.map((item: { id: string }) => item.id)).toEqual([`delivery:1`, 'event:1']);

    await client.equipment.update({ where: { id: equipmentId }, data: { operationalStatus: 'disponible' } });
    const refreshed = await request(app).get('/api/dashboard').set('Cookie', adminCookie);
    expect(refreshed.body.data.cards.equipmentInMaintenance).toBe(0);
    const forbidden = await request(app).get('/api/dashboard').set('Cookie', doctorCookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).not.toHaveProperty('data');
  });
});

describe('Consulta de auditoría', () => {
  it('combina filtros, pagina, sanea detalles y rechaza modificaciones', async () => {
    const response = await request(app).get('/api/audit').set('Cookie', adminCookie).query({
      userId: adminId, action: 'MAINTENANCE_OPEN', from: '2020-01-01', to: '2099-12-31', page: 1, pageSize: 1,
    });
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 1, total: 1 });
    expect(response.body.data[0].details).toMatchObject({ equipmentId, from: 'disponible', to: 'en mantenimiento' });

    const empty = await request(app).get('/api/audit').set('Cookie', adminCookie).query({ action: 'DELIVERY_RECEIVE' });
    expect(empty.body.data).toEqual([]);
    expect(empty.body.total).toBe(0);
    const forbidden = await request(app).get('/api/audit').set('Cookie', doctorCookie);
    expect(forbidden.status).toBe(403);
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const write = await request(app)[method]('/api/audit').set('Cookie', adminCookie).send({});
      expect(write.status).toBe(405);
    }
    expect((await request(app).delete('/api/audit/1').set('Cookie', adminCookie)).status).toBe(405);
  });
});
