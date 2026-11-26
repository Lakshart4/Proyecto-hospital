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
let patientId: number;
let doctorId: number;
let otherDoctorId: number;
let password: string;

async function login(email: string): Promise<string> {
  const response = await request(app).post('/api/auth/login').send({ email, password });
  expect(response.status).toBe(200);
  return (response.headers['set-cookie'] as unknown as string[]).find((value) => value.startsWith('sid='))!.split(';')[0]!;
}

beforeAll(async () => {
  database = createTempDatabase('hm-appointments-');
  client = database.client;
  const department = await client.department.create({ data: { name: 'Consulta externa' } });
  password = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password, BCRYPT_TEST_COST);
  const userData = (internalId: string, email: string, role: string, name: string) => ({
    internalId, email, passwordHash, role, name, position: name, specialty: 'General', departmentId: department.id,
    yearsExperience: 5, shift: 'matutino', phone: '5550000000',
  });
  const admin = await client.user.create({ data: userData('ADM-CIT', 'admin-appointments@example.com', 'ADMIN', 'Administrador') });
  const doctor = await client.user.create({ data: userData('DOC-CIT', 'doctor-appointments@example.com', 'DOCTOR', 'Médico Uno') });
  const otherDoctor = await client.user.create({ data: userData('DOC-CIT-2', 'doctor-two-appointments@example.com', 'DOCTOR', 'Médico Dos') });
  const nurse = await client.user.create({ data: userData('ENF-CIT', 'nurse-appointments@example.com', 'NURSE', 'Enfermero') });
  const patient = await client.patient.create({ data: {
    internalId: 'PAC-CIT-1', firstName: 'Paciente', lastName: 'De Prueba', birthDate: new Date('1990-01-01T00:00:00Z'),
    sex: 'X', admissionDate: NOW, reason: 'Control médico ficticio', status: 'activo', departmentId: department.id,
    doctorId: doctor.id, nurseId: nurse.id,
  } });
  patientId = patient.id;
  doctorId = doctor.id;
  otherDoctorId = otherDoctor.id;
  app = createApp({
    corsOrigin: 'http://localhost:5173', sessionSecret: randomBytes(32).toString('base64url'), db: client,
    now: () => new Date(NOW), bcryptCost: BCRYPT_TEST_COST, logError: () => undefined,
  });
  adminCookie = await login(admin.email);
  doctorCookie = await login(doctor.email);
  nurseCookie = await login(nurse.email);
}, 60_000);

afterAll(async () => { await database.cleanup(); });

const body = (doctor: number, hour: number) => ({
  patientId, doctorId: doctor, scheduledAt: `2026-12-02T${String(hour).padStart(2, '0')}:00:00.000Z`,
  durationMinutes: 30, reason: 'Revisión médica ficticia', notes: 'Sin notas adicionales',
});

describe('Citas médicas', () => {
  it('crea, consulta, edita, evita empalmes y cancela conservando auditoría', async () => {
    const created = await request(app).post('/api/appointments').set('Cookie', adminCookie).send(body(doctorId, 10));
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ patientId, doctorId, status: 'programada', durationMinutes: 30 });
    const id = created.body.data.id as number;

    const doctorConflict = await request(app).post('/api/appointments').set('Cookie', adminCookie).send({ ...body(doctorId, 10), scheduledAt: '2026-12-02T10:15:00.000Z' });
    expect(doctorConflict.status).toBe(409);
    const patientConflict = await request(app).post('/api/appointments').set('Cookie', adminCookie).send({ ...body(otherDoctorId, 10), scheduledAt: '2026-12-02T10:15:00.000Z' });
    expect(patientConflict.status).toBe(409);
    const past = await request(app).post('/api/appointments').set('Cookie', adminCookie).send({ ...body(otherDoctorId, 10), scheduledAt: '2026-11-30T10:00:00.000Z' });
    expect(past.status).toBe(400);

    const updated = await request(app).put(`/api/appointments/${id}`).set('Cookie', doctorCookie).send(body(doctorId, 11));
    expect(updated.status).toBe(200);
    expect(updated.body.data.scheduledAt).toBe('2026-12-02T11:00:00.000Z');

    const listed = await request(app).get('/api/appointments').set('Cookie', doctorCookie).query({ status: 'programada', from: '2026-12-02', to: '2026-12-02' });
    expect(listed.status).toBe(200);
    expect(listed.body).toMatchObject({ total: 1, page: 1, pageSize: 10 });
    expect(listed.body.data[0]).toMatchObject({ id, patient: { id: patientId }, doctor: { id: doctorId } });

    const canceled = await request(app).patch(`/api/appointments/${id}/cancel`).set('Cookie', doctorCookie).send({ reason: 'Cancelación ficticia de prueba' });
    expect(canceled.status).toBe(200);
    expect(canceled.body.data).toMatchObject({ status: 'cancelada', cancelReason: 'Cancelación ficticia de prueba' });
    expect((await request(app).put(`/api/appointments/${id}`).set('Cookie', adminCookie).send(body(doctorId, 12))).status).toBe(409);
    expect((await request(app).patch(`/api/appointments/${id}/cancel`).set('Cookie', adminCookie).send({ reason: '' })).status).toBe(409);
    expect(await client.auditLog.count({ where: { entityType: 'Appointment', entityId: id } })).toBe(3);
  });

  it('aplica alcance por médico y permisos por rol', async () => {
    const created = await request(app).post('/api/appointments').set('Cookie', adminCookie).send(body(otherDoctorId, 14));
    expect(created.status).toBe(201);
    const id = created.body.data.id as number;
    expect((await request(app).get(`/api/appointments/${id}`).set('Cookie', doctorCookie)).status).toBe(403);
    expect((await request(app).post('/api/appointments').set('Cookie', doctorCookie).send(body(otherDoctorId, 15))).status).toBe(403);
    expect((await request(app).get('/api/appointments').set('Cookie', nurseCookie)).status).toBe(403);
    const own = await request(app).get('/api/appointments').set('Cookie', doctorCookie);
    expect(own.body.data.every((item: { doctorId: number }) => item.doctorId === doctorId)).toBe(true);
    expect(own.body.data.some((item: { id: number }) => item.id === id)).toBe(false);
  });
});
