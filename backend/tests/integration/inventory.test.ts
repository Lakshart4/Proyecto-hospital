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
let supplierId: number;
let doctorCookie: string;

beforeAll(async () => {
  database = createTempDatabase('hm-inventory-');
  client = database.client;
  const department = await client.department.create({ data: { name: 'Inventario de pruebas' } });
  const password = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password, BCRYPT_TEST_COST);
  const admin = await client.user.create({ data: {
    internalId: 'ADM-INV', email: 'admin-inventory@example.com', passwordHash, role: 'ADMIN', name: 'Administrador',
    position: 'Dirección', specialty: 'General', departmentId: department.id, yearsExperience: 4, shift: 'matutino', phone: '5550000001',
  } });
  const doctor = await client.user.create({ data: {
    internalId: 'DOC-INV', email: 'doctor-inventory@example.com', passwordHash, role: 'DOCTOR', name: 'Médico',
    position: 'Médico', specialty: 'General', departmentId: department.id, yearsExperience: 4, shift: 'matutino', phone: '5550000002',
  } });
  const supplier = await client.supplier.create({ data: { name: 'Proveedor ficticio', contact: 'contacto@example.com' } });
  supplierId = supplier.id;
  app = createApp({ corsOrigin: 'http://localhost:5173', sessionSecret: randomBytes(32).toString('base64url'), db: client, bcryptCost: BCRYPT_TEST_COST, logError: () => undefined });
  const login = async (email: string) => {
    const response = await request(app).post('/api/auth/login').send({ email, password });
    expect(response.status).toBe(200);
    return (response.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('sid='))!.split(';')[0]!;
  };
  cookie = await login(admin.email);
  doctorCookie = await login(doctor.email);
}, 60_000);

afterAll(async () => { await database.cleanup(); });

const productBody = (quantity: number) => ({
  name: 'Material estéril de demostración', category: 'insumo médico', classification: 'material médico',
  quantity, minStock: 5, supplierId,
});

describe('Inventario médico', () => {
  it('crea, consulta, filtra, edita y registra movimientos con alertas de stock', async () => {
    const created = await request(app).post('/api/inventory/products').set('Cookie', cookie).send(productBody(5));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ quantity: 5, lowStock: true, availability: 'disponible' });
    const id = created.body.data.id as number;

    const listed = await request(app).get('/api/inventory/products').set('Cookie', cookie).query({ search: 'estéril', category: 'insumo médico', lowStock: true });
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ page: 1, pageSize: 10, total: 1 });
    expect(listed.body.data[0]).toMatchObject({ id, supplier: { id: supplierId } });

    const updated = await request(app).put(`/api/inventory/products/${id}`).set('Cookie', cookie).send(productBody(2));
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ quantity: 2, lowStock: true });

    const movement = await request(app).post(`/api/inventory/products/${id}/movements`).set('Cookie', cookie).send({ type: 'salida', quantity: 2, reason: 'Consumo ficticio de prueba' });
    expect(movement.status).toBe(201);
    expect(movement.body.data).toMatchObject({ quantityBefore: 2, quantityAfter: 0, type: 'salida' });

    const exhausted = await request(app).get(`/api/inventory/products/${id}`).set('Cookie', cookie);
    expect(exhausted.body.data).toMatchObject({ quantity: 0, lowStock: true, availability: 'agotado' });
    const rejected = await request(app).post(`/api/inventory/products/${id}/movements`).set('Cookie', cookie).send({ type: 'salida', quantity: 1, reason: 'Salida inválida' });
    expect(rejected.status).toBe(409);
    expect((await client.product.findUniqueOrThrow({ where: { id } })).quantity).toBe(0);

    const history = await request(app).get(`/api/inventory/products/${id}/movements`).set('Cookie', cookie);
    expect(history.body.data).toHaveLength(3);
    expect(await client.auditLog.count({ where: { action: 'INVENTORY_MOVEMENT', entityId: id } })).toBe(3);
  });

  it('permite eliminar un producto sin dependencias y bloquea el acceso de otros roles', async () => {
    const created = await request(app).post('/api/inventory/products').set('Cookie', cookie).send(productBody(0));
    expect(created.status).toBe(201);
    const id = created.body.data.id as number;
    const removed = await request(app).delete(`/api/inventory/products/${id}`).set('Cookie', cookie);
    expect(removed.status).toBe(204);
    expect(await client.product.count({ where: { id } })).toBe(0);

    const forbidden = await request(app).get('/api/inventory/products').set('Cookie', doctorCookie);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).not.toHaveProperty('data');
  });
});
