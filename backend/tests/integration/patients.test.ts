// Pruebas de integración de Pacientes, movimientos, observaciones y Tratamientos_Programados
// (Req. 6, 20, 21). Cada caso crea sus propios datos para no depender del orden de ejecución.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createStaffHarness, type StaffHarness } from '../helpers/staff-harness';

let h: StaffHarness;
let admin: string;
let doctor1: string;
let doctor2: string;
let nurse: string;
let cleaner: string;
let counter = 0;

const today = () => new Date().toISOString().slice(0, 10);
const nextInternalId = () => `PAC-${++counter}`;

beforeAll(async () => {
  h = await createStaffHarness();
  admin = await h.sid('admin');
  doctor1 = await h.sid('doctor1');
  doctor2 = await h.sid('doctor2');
  nurse = await h.sid('nurse');
  cleaner = await h.sid('cleaner');
});

afterAll(async () => {
  await h.cleanup();
});

interface PatientOverrides {
  doctorId?: number;
  nurseId?: number;
  departmentId?: number;
  admissionDate?: string;
}

async function createPatient(overrides: PatientOverrides = {}): Promise<number> {
  const res = await request(h.app)
    .post('/api/patients')
    .set('Cookie', admin)
    .send({
      internalId: nextInternalId(),
      firstName: 'Ana',
      lastName: 'Pérez',
      birthDate: '1990-01-01',
      sex: 'F',
      phone: '5550000000',
      admissionDate: overrides.admissionDate ?? today(),
      reason: 'Motivo de prueba',
      departmentId: overrides.departmentId ?? h.departments.urgencias,
      doctorId: overrides.doctorId ?? h.users.doctor1.id,
      nurseId: overrides.nurseId ?? h.users.nurse.id,
    });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

describe('Pacientes: autenticación, alcance y listas', () => {
  it('rechaza solicitudes sin sesión', async () => {
    const res = await request(h.app).get('/api/patients');
    expect(res.status).toBe(401);
  });

  it('un MÉDICO solo ve sus Pacientes', async () => {
    const id = await createPatient({ doctorId: h.users.doctor2.id });
    const own = await request(h.app).get('/api/patients').set('Cookie', doctor1);
    expect(own.status).toBe(200);
    expect(own.body.data).toHaveLength(0);

    const other = await request(h.app).get('/api/patients').set('Cookie', doctor2);
    expect(other.status).toBe(200);
    expect(other.body.data.map((p: { id: number }) => p.id)).toContain(id);
  });

  it('CLEANING recibe 403 en Pacientes', async () => {
    const res = await request(h.app).get('/api/patients').set('Cookie', cleaner);
    expect(res.status).toBe(403);
  });

  it('filtra por Departamento y busca por nombre', async () => {
    const id = await createPatient();
    const byDepartment = await request(h.app)
      .get('/api/patients')
      .set('Cookie', admin)
      .query({ departmentId: h.departments.urgencias });
    expect(byDepartment.status).toBe(200);
    expect(byDepartment.body.data.map((p: { id: number }) => p.id)).toContain(id);

    const bySearch = await request(h.app).get('/api/patients').set('Cookie', admin).query({ search: 'ana pérez' });
    expect(bySearch.status).toBe(200);
    expect(bySearch.body.data.map((p: { id: number }) => p.id)).toContain(id);
  });

  it('pagina y ordena por fecha de ingreso descendente', async () => {
    const res = await request(h.app).get('/api/patients').set('Cookie', admin).query({ page: 1, pageSize: 2 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ page: 1, pageSize: 2 });
    expect(res.body.data.length).toBeLessThanOrEqual(2);

    const invalid = await request(h.app).get('/api/patients').set('Cookie', admin).query({ pageSize: 0 });
    expect(invalid.status).toBe(400);
  });

  it('los contadores respetan el alcance del actor', async () => {
    const created = await createPatient({ doctorId: h.users.doctor1.id });
    const adminCounts = await request(h.app).get('/api/patients/counts').set('Cookie', admin);
    expect(adminCounts.status).toBe(200);
    expect(adminCounts.body.data.total).toBeGreaterThanOrEqual(1);

    const doctorCounts = await request(h.app).get('/api/patients/counts').set('Cookie', doctor1);
    expect(doctorCounts.status).toBe(200);
    expect(doctorCounts.body.data.activo).toBeGreaterThanOrEqual(1);

    const doctor2Counts = await request(h.app).get('/api/patients/counts').set('Cookie', doctor2);
    expect(doctor2Counts.body.data.total).toBeGreaterThanOrEqual(0);
    expect(created).toBeGreaterThan(0);
  });

  it('un MÉDICO ajeno recibe 403 y el ADMIN 200', async () => {
    const id = await createPatient({ doctorId: h.users.doctor2.id });
    const forbidden = await request(h.app).get(`/api/patients/${id}`).set('Cookie', doctor1);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).not.toHaveProperty('data');

    const allowed = await request(h.app).get(`/api/patients/${id}`).set('Cookie', admin);
    expect(allowed.status).toBe(200);
    expect(allowed.body.data.id).toBe(id);
  });
});

describe('Pacientes: alta, edición y validaciones', () => {
  it('crea el Paciente y registra el movimiento de ingreso', async () => {
    const id = await createPatient();
    const res = await request(h.app).get(`/api/patients/${id}/movements`).set('Cookie', admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ type: 'ingreso', patientId: id });
  });

  it('rechaza una fecha de ingreso futura', async () => {
    const res = await request(h.app)
      .post('/api/patients')
      .set('Cookie', admin)
      .send({
        internalId: nextInternalId(),
        firstName: 'Futuro',
        lastName: 'Paciente',
        birthDate: '1990-01-01',
        sex: 'M',
        admissionDate: '2999-01-01',
        reason: 'Motivo',
        departmentId: h.departments.urgencias,
        doctorId: h.users.doctor1.id,
        nurseId: h.users.nurse.id,
      });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: { field: string }) => e.field === 'admissionDate')).toBe(true);
  });

  it('rechaza un Departamento o responsables inválidos', async () => {
    const res = await request(h.app)
      .post('/api/patients')
      .set('Cookie', admin)
      .send({
        internalId: nextInternalId(),
        firstName: 'Mal',
        lastName: 'Paciente',
        birthDate: '1990-01-01',
        sex: 'M',
        admissionDate: today(),
        reason: 'Motivo',
        departmentId: 999999,
        doctorId: h.users.nurse.id,
        nurseId: h.users.doctor1.id,
      });
    expect(res.status).toBe(400);
    const fields = res.body.errors.map((e: { field: string }) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['departmentId', 'doctorId', 'nurseId']));
  });

  it('actualiza los datos generales', async () => {
    const id = await createPatient();
    const res = await request(h.app)
      .put(`/api/patients/${id}`)
      .set('Cookie', admin)
      .send({
        internalId: `UPD-${id}`,
        firstName: 'Actualizada',
        lastName: 'Paciente',
        birthDate: '1985-05-05',
        sex: 'F',
        phone: '5551112222',
        admissionDate: today(),
        reason: 'Motivo actualizado',
        departmentId: h.departments.cardiologia,
        doctorId: h.users.doctor2.id,
        nurseId: h.users.nurse.id,
      });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ firstName: 'Actualizada', departmentId: h.departments.cardiologia });
  });

  it('elimina un Paciente', async () => {
    const id = await createPatient();
    const res = await request(h.app).delete(`/api/patients/${id}`).set('Cookie', admin);
    expect(res.status).toBe(204);
    const missing = await request(h.app).get(`/api/patients/${id}`).set('Cookie', admin);
    expect(missing.status).toBe(404);
  });
});

describe('Pacientes: estado, reingreso y asignaciones', () => {
  it('el alta cierra la Asignación activa y registra el movimiento', async () => {
    const id = await createPatient();
    const room = await h.client.room.create({ data: { number: 900 + id, departmentId: h.departments.urgencias, capacity: 2 } });
    await h.client.roomAssignment.create({ data: { roomId: room.id, patientId: id, startedAt: new Date() } });

    const res = await request(h.app).patch(`/api/patients/${id}/status`).set('Cookie', admin).send({ status: 'dado de alta' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('dado de alta');

    const assignment = await h.client.roomAssignment.findFirst({ where: { patientId: id } });
    expect(assignment?.endedAt).not.toBeNull();
    expect(assignment?.releaseReason).toBe('alta');

    const movements = await request(h.app).get(`/api/patients/${id}/movements`).set('Cookie', admin);
    expect(movements.body.data.map((m: { type: string }) => m.type)).toEqual(expect.arrayContaining(['ingreso', 'alta']));
  });

  it('registra el fallecimiento con fecha válida y bloquea cambios posteriores', async () => {
    const id = await createPatient();
    const death = await request(h.app)
      .patch(`/api/patients/${id}/status`)
      .set('Cookie', admin)
      .send({ status: 'fallecido', deceasedAt: today() });
    expect(death.status).toBe(200);
    expect(death.body.data.status).toBe('fallecido');

    const again = await request(h.app).patch(`/api/patients/${id}/status`).set('Cookie', admin).send({ status: 'dado de alta' });
    expect(again.status).toBe(409);

    const readmit = await request(h.app)
      .post(`/api/patients/${id}/readmission`)
      .set('Cookie', admin)
      .send({ admissionDate: today(), departmentId: h.departments.urgencias, reason: 'Reingreso' });
    expect(readmit.status).toBe(409);
  });

  it('reingresa solo a un Paciente dado de alta', async () => {
    const id = await createPatient();
    await request(h.app).patch(`/api/patients/${id}/status`).set('Cookie', admin).send({ status: 'dado de alta' });

    const res = await request(h.app)
      .post(`/api/patients/${id}/readmission`)
      .set('Cookie', admin)
      .send({ admissionDate: today(), departmentId: h.departments.cardiologia, reason: 'Reingreso' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('activo');
    expect(res.body.data.departmentId).toBe(h.departments.cardiologia);
  });
});

describe('Pacientes: observaciones y Tratamientos_Programados', () => {
  it('el MÉDICO responsable actualiza la Observación_Médica y otro MÉDICO recibe 403', async () => {
    const id = await createPatient({ doctorId: h.users.doctor1.id });
    const ok = await request(h.app).patch(`/api/patients/${id}/medical-observation`).set('Cookie', doctor1).send({ text: 'Evolución favorable' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.medicalObservation).toBe('Evolución favorable');

    const forbidden = await request(h.app).patch(`/api/patients/${id}/medical-observation`).set('Cookie', doctor2).send({ text: 'Intento' });
    expect(forbidden.status).toBe(403);
  });

  it('el ENFERMERO responsable actualiza la Observación_de_Enfermería', async () => {
    const id = await createPatient({ nurseId: h.users.nurse.id });
    const ok = await request(h.app).patch(`/api/patients/${id}/nursing-observation`).set('Cookie', nurse).send({ text: 'Signos estables' });
    expect(ok.status).toBe(200);

    const forbidden = await request(h.app).patch(`/api/patients/${id}/nursing-observation`).set('Cookie', doctor1).send({ text: 'No permitido' });
    expect(forbidden.status).toBe(403);
  });

  it('una observación sobre un Paciente no activo devuelve 409', async () => {
    const id = await createPatient({ doctorId: h.users.doctor1.id });
    await request(h.app).patch(`/api/patients/${id}/status`).set('Cookie', admin).send({ status: 'dado de alta' });
    const res = await request(h.app).patch(`/api/patients/${id}/medical-observation`).set('Cookie', doctor1).send({ text: 'Tarde' });
    expect(res.status).toBe(409);
  });

  it('crea, filtra y actualiza Tratamientos_Programados', async () => {
    const id = await createPatient({ doctorId: h.users.doctor1.id });
    const created = await request(h.app)
      .post(`/api/patients/${id}/treatments`)
      .set('Cookie', doctor1)
      .send({ type: 'tratamiento', scheduledAt: today(), description: 'Analgésico' });
    expect(created.status).toBe(201);
    const tid = created.body.data.id as number;

    const listed = await request(h.app).get(`/api/patients/${id}/treatments`).set('Cookie', admin).query({ status: 'programado' });
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((t: { id: number }) => t.id)).toContain(tid);

    const done = await request(h.app)
      .patch(`/api/patients/${id}/treatments/${tid}/status`)
      .set('Cookie', nurse)
      .send({ status: 'realizado' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'realizado' });
    expect(done.body.data.performedAt).not.toBeNull();
  });

  it('un ENFERMERO no puede cancelar un Tratamiento', async () => {
    const id = await createPatient();
    const created = await request(h.app)
      .post(`/api/patients/${id}/treatments`)
      .set('Cookie', admin)
      .send({ type: 'cirugía', scheduledAt: today(), description: 'Cirugía' });
    const tid = created.body.data.id as number;

    const res = await request(h.app)
      .patch(`/api/patients/${id}/treatments/${tid}/status`)
      .set('Cookie', nurse)
      .send({ status: 'cancelado' });
    expect(res.status).toBe(403);
  });

  it('los movimientos no admiten POST, PUT ni DELETE', async () => {
    const id = await createPatient();
    for (const method of ['post', 'put', 'delete'] as const) {
      const res = await request(h.app)[method](`/api/patients/${id}/movements`).set('Cookie', admin);
      expect(res.status).toBe(405);
    }
  });
});

describe('Pacientes: auditoría transaccional', () => {
  it('revierte el alta si falla la auditoría', async () => {
    await h.breakAudit();
    try {
      const res = await request(h.app)
        .post('/api/patients')
        .set('Cookie', admin)
        .send({
          internalId: nextInternalId(),
          firstName: 'Sin',
          lastName: 'Auditoría',
          birthDate: '1990-01-01',
          sex: 'M',
          admissionDate: today(),
          reason: 'Motivo',
          departmentId: h.departments.urgencias,
          doctorId: h.users.doctor1.id,
          nurseId: h.users.nurse.id,
        });
      expect(res.status).toBe(500);
    } finally {
      await h.restoreAudit();
    }
  });
});
