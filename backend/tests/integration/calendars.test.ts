// Integración real de la tarea 6.21: Express, seguridad, validación, servicio y SQLite temporal.

import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword } from '../../src/lib/password';
import { createCalendarsRouter } from '../../src/routes/calendars.routes';
import { createCalendarsService } from '../../src/services/calendars.service';
import { createHolidayService } from '../../src/services/holidays.service';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

let database: TempDatabase;
let app: Express;
let filesDir: string;
let departmentId: number;
const password = randomBytes(12).toString('base64url');
const users = {} as Record<'admin' | 'doctor' | 'nurse', { id: number; email: string }>;
const cookies = {} as Record<keyof typeof users, string>;
const range = { from: '2026-03-01', to: '2026-03-31' };

async function login(key: keyof typeof users): Promise<void> {
  const response = await request(app).post('/api/auth/login').send({ email: users[key].email, password });
  expect(response.status).toBe(200);
  const headers = response.headers['set-cookie'] as unknown as string[];
  const session = headers.find((cookie) => cookie.startsWith('sid='));
  expect(session).toBeDefined();
  cookies[key] = session!.split(';')[0]!;
}

beforeAll(async () => {
  database = createTempDatabase('hm-calendars-');
  filesDir = mkdtempSync(join(tmpdir(), 'hm-calendars-files-'));
  const department = await database.client.department.create({ data: { name: 'Calendarios' } });
  departmentId = department.id;
  const passwordHash = await hashPassword(password, BCRYPT_TEST_COST);

  const fixtures = [
    { key: 'admin' as const, role: 'ADMIN', name: 'Dirección', shift: 'matutino', birthDate: null, schedule: [] },
    {
      key: 'doctor' as const,
      role: 'DOCTOR',
      name: 'Doctor Agenda',
      shift: 'matutino',
      birthDate: new Date('1992-02-29T00:00:00.000Z'),
      schedule: [{ dayOfWeek: 2, startTime: '08:00', endTime: '15:00', mealStart: '12:00', mealEnd: '12:30' }],
    },
    {
      key: 'nurse' as const,
      role: 'NURSE',
      name: 'Enfermera Agenda',
      shift: 'vespertino',
      birthDate: new Date('1990-05-14T00:00:00.000Z'),
      schedule: [{ dayOfWeek: 2, startTime: '15:00', endTime: '22:00' }],
    },
  ];

  for (const fixture of fixtures) {
    const email = `${fixture.key}-calendars@example.com`;
    const user = await database.client.user.create({
      data: {
        internalId: `CAL-${fixture.key}`,
        email,
        passwordHash,
        role: fixture.role,
        name: fixture.name,
        position: 'Cargo',
        specialty: 'General',
        departmentId,
        yearsExperience: 3,
        shift: fixture.shift,
        phone: '5551234567',
        birthDate: fixture.birthDate,
        scheduleSlots: { create: fixture.schedule },
      },
    });
    users[fixture.key] = { id: user.id, email };
  }

  const holidays = createHolidayService({ enabled: false, country: 'MX', fetch: vi.fn() });
  const calendars = createCalendarsService({ db: database.client, holidays });
  app = createApp({
    corsOrigin: 'http://localhost:5173',
    sessionSecret: randomBytes(32).toString('hex'),
    db: database.client,
    bcryptCost: BCRYPT_TEST_COST,
    logError: () => undefined,
    photosDir: join(filesDir, 'photos'),
    documentsDir: join(filesDir, 'documents'),
    extraRoutes: (router, security) => {
      router.use(createCalendarsRouter({ service: calendars, security }));
    },
  });

  await Promise.all([login('admin'), login('doctor'), login('nurse')]);
});

afterAll(async () => {
  await database.cleanup();
  rmSync(filesDir, { recursive: true, force: true });
});

describe('Calendarios y RBAC', () => {
  it('exige sesión y reserva Eventos generales y Días_Inhábiles a ADMIN', async () => {
    expect((await request(app).get('/api/calendars/general').query(range)).status).toBe(401);

    const event = await request(app).post('/api/events').set('Cookie', cookies.doctor).send({
      title: 'No permitido', type: 'general', startAt: '2026-03-10T16:00:00.000Z', endAt: '2026-03-10T17:00:00.000Z',
    });
    expect(event.status).toBe(403);

    const day = await request(app).post('/api/non-working-days').set('Cookie', cookies.nurse).send({
      title: 'No permitido', date: '2026-03-20', description: '',
    });
    expect(day.status).toBe(403);
  });

  it('crea, edita y elimina Eventos generales y valida fin anterior a inicio', async () => {
    const invalid = await request(app).post('/api/events').set('Cookie', cookies.admin).send({
      title: 'Inválido', type: 'general', startAt: '2026-03-10T17:00:00.000Z', endAt: '2026-03-10T16:00:00.000Z',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'endAt' })]));

    const created = await request(app).post('/api/events').set('Cookie', cookies.admin).send({
      title: 'Junta general', description: 'Junta mensual', type: 'general',
      startAt: '2026-03-10T16:00:00.000Z', endAt: '2026-03-10T17:00:00.000Z',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ title: 'Junta general', type: 'general', ownerId: null });
    const id = created.body.data.id as number;

    const updated = await request(app).put(`/api/events/${id}`).set('Cookie', cookies.admin).send({
      title: 'Junta editada', type: 'general', startAt: '2026-03-10T16:00:00.000Z', endAt: '2026-03-10T18:00:00.000Z',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Junta editada');

    const calendar = await request(app).get('/api/calendars/general').set('Cookie', cookies.doctor).query(range);
    expect(calendar.status).toBe(200);
    expect(calendar.body.available).toBe(false);
    expect(calendar.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: `event:${id}`, title: 'Junta editada' })]));

    expect((await request(app).delete(`/api/events/${id}`).set('Cookie', cookies.admin)).status).toBe(204);
    expect(await database.client.event.findUnique({ where: { id } })).toBeNull();
  });

  it('devuelve cumpleaños y limita los turnos de cada Empleado a su propio horario', async () => {
    const birthdays = await request(app).get('/api/calendars/birthdays').set('Cookie', cookies.nurse).query({ year: 2026 });
    expect(birthdays.status).toBe(200);
    expect(birthdays.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `birthday:${users.doctor.id}:2026`, date: '2026-02-28' }),
      expect.objectContaining({ id: `birthday:${users.nurse.id}:2026`, date: '2026-05-14' }),
    ]));
    expect(birthdays.body.data.some((event: { id: string }) => event.id.includes(`birthday:${users.admin.id}:`))).toBe(false);

    const shifts = await request(app).get('/api/calendars/shifts').set('Cookie', cookies.doctor).query({ from: '2026-03-10', to: '2026-03-10' });
    expect(shifts.status).toBe(200);
    expect(shifts.body.data).toHaveLength(1);
    expect(Object.keys(shifts.body.data[0].shifts)).toEqual(['matutino']);
    expect(shifts.body.data[0].shifts.matutino.map((entry: { userId: number }) => entry.userId)).toEqual([users.doctor.id]);
    expect(shifts.body.data[0].shifts.matutino[0]).toMatchObject({ startTime: '08:00', endTime: '15:00' });
  });
});

describe('Agenda individual', () => {
  it('solo su propietario modifica Eventos personales; ADMIN puede consultar pero no editar otra agenda', async () => {
    const created = await request(app).post('/api/events/personal').set('Cookie', cookies.doctor).send({
      title: 'Cita personal', description: 'Privada', startAt: '2026-03-11T16:00:00.000Z', endAt: '2026-03-11T17:00:00.000Z',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as number;
    expect(created.body.data).toMatchObject({ type: 'agenda individual', ownerId: users.doctor.id });

    const body = { title: 'Cita editada', startAt: '2026-03-11T16:00:00.000Z', endAt: '2026-03-11T17:30:00.000Z' };
    expect((await request(app).put(`/api/events/personal/${id}`).set('Cookie', cookies.admin).send(body)).status).toBe(403);
    expect((await request(app).put(`/api/events/personal/${id}`).set('Cookie', cookies.nurse).send(body)).status).toBe(403);
    expect((await request(app).put(`/api/events/personal/${id}`).set('Cookie', cookies.doctor).send(body)).status).toBe(200);

    const own = await request(app).get('/api/calendars/agenda').set('Cookie', cookies.doctor).query(range);
    expect(own.status).toBe(200);
    expect(own.body.data.userId).toBe(users.doctor.id);
    expect(own.body.data.schedule[0]).toMatchObject({ dayOfWeek: 2, startTime: '08:00', mealStart: '12:00', mealEnd: '12:30' });
    expect(own.body.data.events).toEqual(expect.arrayContaining([expect.objectContaining({ id: `event:${id}`, title: 'Cita editada' })]));

    expect((await request(app).get('/api/calendars/agenda').set('Cookie', cookies.doctor).query({ ...range, userId: users.doctor.id })).status).toBe(403);
    expect((await request(app).get('/api/calendars/agenda').set('Cookie', cookies.doctor).query({ ...range, userId: users.nurse.id })).status).toBe(403);
    const adminView = await request(app).get('/api/calendars/agenda').set('Cookie', cookies.admin).query({ ...range, userId: users.doctor.id });
    expect(adminView.status).toBe(200);
    expect(adminView.body.data.userId).toBe(users.doctor.id);

    const genericBody = { ...body, type: 'general' };
    expect((await request(app).put(`/api/events/${id}`).set('Cookie', cookies.admin).send(genericBody)).status).toBe(404);
    expect((await request(app).delete(`/api/events/personal/${id}`).set('Cookie', cookies.admin)).status).toBe(403);
  });

  it('incluye solo Tratamientos programados y asignados dentro del rango', async () => {
    const patient = await database.client.patient.create({
      data: {
        internalId: 'PAC-CAL-1', firstName: 'Paciente', lastName: 'Agenda', birthDate: new Date('1980-01-01T00:00:00.000Z'),
        sex: 'F', admissionDate: new Date('2026-03-01T00:00:00.000Z'), reason: 'Prueba', status: 'activo',
        departmentId, doctorId: users.doctor.id, nurseId: users.nurse.id,
      },
    });
    const scheduled = await database.client.treatment.create({
      data: { patientId: patient.id, type: 'tratamiento', status: 'programado', scheduledAt: new Date('2026-03-11T18:00:00.000Z'), description: 'Visible', createdById: users.admin.id },
    });
    await database.client.treatment.createMany({
      data: [
        { patientId: patient.id, type: 'tratamiento', status: 'realizado', scheduledAt: new Date('2026-03-12T18:00:00.000Z'), description: 'Realizado', createdById: users.admin.id },
        { patientId: patient.id, type: 'tratamiento', status: 'programado', scheduledAt: new Date('2026-04-12T18:00:00.000Z'), description: 'Fuera', createdById: users.admin.id },
      ],
    });

    const response = await request(app).get('/api/calendars/agenda').set('Cookie', cookies.nurse).query(range);
    expect(response.status).toBe(200);
    expect(response.body.data.treatments.map((treatment: { id: number }) => treatment.id)).toEqual([scheduled.id]);
    expect(response.body.data.treatments[0].patient).toMatchObject({ id: patient.id, internalId: 'PAC-CAL-1' });
  });
});

describe('Días inhábiles, feriados y entregas virtuales', () => {
  it('normaliza la fecha, impide duplicados y completa el CRUD de Días_Inhábiles', async () => {
    const created = await request(app).post('/api/non-working-days').set('Cookie', cookies.admin).send({
      title: 'Cierre institucional', description: 'Sin actividades', date: '2026-03-20T23:00:00.000Z',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.date).toBe('2026-03-20T00:00:00.000Z');
    const id = created.body.data.id as number;

    const duplicate = await request(app).post('/api/non-working-days').set('Cookie', cookies.admin).send({
      title: 'Duplicado', description: '', date: '2026-03-20',
    });
    expect(duplicate.status).toBe(409);

    const updated = await request(app).put(`/api/non-working-days/${id}`).set('Cookie', cookies.admin).send({
      title: 'Cierre editado', description: 'Actualizado', date: '2026-03-21',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.title).toBe('Cierre editado');

    const listed = await request(app).get('/api/non-working-days').set('Cookie', cookies.nurse);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ id, title: 'Cierre editado' })]));
    expect((await request(app).delete(`/api/non-working-days/${id}`).set('Cookie', cookies.admin)).status).toBe(204);
  });

  it('valida el año y mantiene disponible el calendario sin Nager.Date', async () => {
    expect((await request(app).get('/api/holidays').set('Cookie', cookies.doctor).query({ year: 1899 })).status).toBe(400);
    const response = await request(app).get('/api/holidays').set('Cookie', cookies.doctor).query({ year: 2026 });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ available: false, data: [] });
  });

  it('genera entregas virtuales con sus datos y excluye las canceladas', async () => {
    const supplier = await database.client.supplier.create({ data: { name: 'Proveedor Calendario', contact: 'Contacto' } });
    const product = await database.client.product.create({
      data: { name: 'Producto Calendario', category: 'insumo', classification: 'General', quantity: 10, minStock: 2, supplierId: supplier.id },
    });
    const deliveries = await Promise.all(['programada', 'recibida', 'cancelada'].map((status, index) =>
      database.client.supplierDelivery.create({
        data: {
          supplierId: supplier.id, productId: product.id, quantityRequested: 5 + index, status,
          scheduledDate: new Date(`2026-03-${13 + index}T15:00:00.000Z`),
        },
      }),
    ));

    const response = await request(app).get('/api/calendars/activities').set('Cookie', cookies.nurse).query(range);
    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: `delivery:${deliveries[0]!.id}`, delivery: expect.objectContaining({ supplierName: supplier.name, productName: product.name, quantityRequested: 5 }) }),
      expect.objectContaining({ id: `delivery:${deliveries[1]!.id}` }),
    ]));
    expect(response.body.data.some((event: { id: string }) => event.id === `delivery:${deliveries[2]!.id}`)).toBe(false);
  });

  it('rechaza rangos de calendario invertidos', async () => {
    const response = await request(app).get('/api/calendars/activities').set('Cookie', cookies.admin).query({ from: '2026-03-31', to: '2026-03-01' });
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'to' })]));
  });
});
