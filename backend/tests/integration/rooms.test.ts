// Pruebas E2E de Habitaciones, Asignaciones, liberaciones e Historial_de_Ocupación (tareas 6.7 y 6.10).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createStaffHarness, type StaffHarness } from '../helpers/staff-harness';

let h: StaffHarness;
let admin: string;
let doctor: string;
let cleaner: string;
let sequence = 0;

const today = () => new Date().toISOString().slice(0, 10);

beforeAll(async () => {
  h = await createStaffHarness();
  admin = await h.sid('admin');
  doctor = await h.sid('doctor1');
  cleaner = await h.sid('cleaner');
});

afterAll(async () => {
  await h.cleanup();
});

async function createPatient(): Promise<number> {
  sequence += 1;
  const res = await request(h.app)
    .post('/api/patients')
    .set('Cookie', admin)
    .send({
      internalId: `PAC-ROOM-${sequence}`,
      firstName: 'Paciente',
      lastName: `Habitación ${sequence}`,
      birthDate: '1990-01-01',
      sex: 'X',
      admissionDate: today(),
      reason: 'Prueba de ocupación',
      departmentId: h.departments.urgencias,
      doctorId: h.users.doctor1.id,
      nurseId: h.users.nurse.id,
    });
  expect(res.status).toBe(201);
  return res.body.data.id as number;
}

async function createRoom(capacity = 1, departmentId = h.departments.urgencias): Promise<number> {
  sequence += 1;
  const res = await request(h.app)
    .post('/api/rooms')
    .set('Cookie', admin)
    .send({ number: 1000 + sequence, departmentId, capacity });
  expect(res.status).toBe(201);
  expect(res.body.data).toMatchObject({ activeCount: 0, availability: 'disponible', patients: [] });
  return res.body.data.id as number;
}

async function assign(roomId: number, patientId: number): Promise<void> {
  const res = await request(h.app)
    .post(`/api/rooms/${roomId}/assignments`)
    .set('Cookie', admin)
    .send({ patientId });
  expect(res.status).toBe(201);
}

describe('Habitaciones: RBAC y CRUD', () => {
  it('exige sesión y rol ADMIN en habitaciones, contadores e historial', async () => {
    expect((await request(h.app).get('/api/rooms')).status).toBe(401);
    expect((await request(h.app).get('/api/rooms').set('Cookie', cleaner)).status).toBe(403);
    expect((await request(h.app).get('/api/rooms/counters').set('Cookie', doctor)).status).toBe(403);
    expect((await request(h.app).get('/api/occupancy-history').set('Cookie', doctor)).status).toBe(403);
    expect((await request(h.app).get('/api/occupancy-history/summary').set('Cookie', cleaner)).status).toBe(403);
  });

  it('crea, consulta, edita y elimina con disponibilidad derivada', async () => {
    const id = await createRoom(2);
    const listed = await request(h.app).get('/api/rooms').set('Cookie', admin).query({ availability: 'disponible' });
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((room: { id: number }) => room.id)).toContain(id);

    const updated = await request(h.app)
      .put(`/api/rooms/${id}`)
      .set('Cookie', admin)
      .send({ number: 7000 + id, departmentId: h.departments.cardiologia, capacity: 3 });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ capacity: 3, departmentId: h.departments.cardiologia, availability: 'disponible' });

    expect((await request(h.app).delete(`/api/rooms/${id}`).set('Cookie', admin)).status).toBe(204);
    expect((await request(h.app).get(`/api/rooms/${id}`).set('Cookie', admin)).status).toBe(404);
  });

  it('valida rangos, Departamento y número único', async () => {
    const id = await createRoom();
    const room = await h.client.room.findUniqueOrThrow({ where: { id } });
    const duplicate = await request(h.app)
      .post('/api/rooms')
      .set('Cookie', admin)
      .send({ number: room.number, departmentId: h.departments.urgencias, capacity: 1 });
    expect(duplicate.status).toBe(409);

    for (const body of [
      { number: 0, departmentId: h.departments.urgencias, capacity: 1 },
      { number: 10000, departmentId: h.departments.urgencias, capacity: 1 },
      { number: 9998, departmentId: h.departments.urgencias, capacity: 11 },
      { number: 9998, departmentId: 999999, capacity: 1 },
    ]) {
      const res = await request(h.app).post('/api/rooms').set('Cookie', admin).send(body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('Habitaciones: asignación y liberación transaccional', () => {
  it('incluye Pacientes activos y rechaza habitación llena o Paciente ya asignado sin cambios', async () => {
    const fullRoom = await createRoom(1);
    const otherRoom = await createRoom(1);
    const first = await createPatient();
    const second = await createPatient();
    await assign(fullRoom, first);

    const detail = await request(h.app).get(`/api/rooms/${fullRoom}`).set('Cookie', admin);
    expect(detail.body.data).toMatchObject({ activeCount: 1, availability: 'ocupada' });
    expect(detail.body.data.patients).toHaveLength(1);
    expect(detail.body.data.patients[0]).toMatchObject({ patientId: first, status: 'activo' });

    const occupied = await request(h.app)
      .post(`/api/rooms/${fullRoom}/assignments`)
      .set('Cookie', admin)
      .send({ patientId: second });
    expect(occupied.status).toBe(409);

    const alreadyAssigned = await request(h.app)
      .post(`/api/rooms/${otherRoom}/assignments`)
      .set('Cookie', admin)
      .send({ patientId: first });
    expect(alreadyAssigned.status).toBe(409);
    expect(await h.client.roomAssignment.count({ where: { endedAt: null } })).toBe(1);
  });

  it('rechaza Pacientes no activos y capacidad menor que la ocupación actual', async () => {
    const roomId = await createRoom(2);
    const first = await createPatient();
    const second = await createPatient();
    await assign(roomId, first);
    await assign(roomId, second);
    await request(h.app).patch(`/api/patients/${second}/status`).set('Cookie', admin).send({ status: 'dado de alta' });

    const inactive = await request(h.app)
      .post(`/api/rooms/${roomId}/assignments`)
      .set('Cookie', admin)
      .send({ patientId: second });
    expect(inactive.status).toBe(409);

    const current = await h.client.room.findUniqueOrThrow({ where: { id: roomId } });
    const resize = await request(h.app)
      .put(`/api/rooms/${roomId}`)
      .set('Cookie', admin)
      .send({ number: current.number, departmentId: current.departmentId, capacity: 0 });
    expect(resize.status).toBe(400);

    // Tras el alta queda una asignación activa; reducir a cero no es válido por esquema y a uno sí lo es.
    const validResize = await request(h.app)
      .put(`/api/rooms/${roomId}`)
      .set('Cookie', admin)
      .send({ number: current.number, departmentId: current.departmentId, capacity: 1 });
    expect(validResize.status).toBe(200);
    expect(validResize.body.data.availability).toBe('ocupada');
  });

  it('rechaza un motivo inválido sin cerrar la Asignación ni cambiar al Paciente', async () => {
    const roomId = await createRoom();
    const patientId = await createPatient();
    await assign(roomId, patientId);

    const res = await request(h.app)
      .post(`/api/rooms/${roomId}/releases`)
      .set('Cookie', admin)
      .send({ patientId, reason: 'traslado' });
    expect(res.status).toBe(400);
    expect(res.body.errors[0].field).toBe('reason');
    const assignment = await h.client.roomAssignment.findFirstOrThrow({ where: { roomId, patientId } });
    expect(assignment.endedAt).toBeNull();
    expect(assignment.releaseReason).toBeNull();
    expect((await h.client.patient.findUniqueOrThrow({ where: { id: patientId } })).status).toBe('activo');
  });

  it.each([
    ['alta', 'dado de alta'],
    ['fallecimiento', 'fallecido'],
  ] as const)('libera por %s, cambia estado, agrega movimiento y audita', async (reason, status) => {
    const roomId = await createRoom();
    const patientId = await createPatient();
    await assign(roomId, patientId);

    const res = await request(h.app)
      .post(`/api/rooms/${roomId}/releases`)
      .set('Cookie', admin)
      .send({ patientId, reason, note: `Liberación por ${reason}` });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ availability: 'disponible' });
    expect(res.body.data.assignment).toMatchObject({ releaseReason: reason });
    expect(res.body.data.patientStatus.status).toBe(status);

    const patient = await h.client.patient.findUniqueOrThrow({ where: { id: patientId } });
    expect(patient.status).toBe(status);
    if (reason === 'fallecimiento') expect(patient.deceasedAt).not.toBeNull();
    const movement = await h.client.patientMovement.findFirst({ where: { patientId, type: reason } });
    expect(movement).not.toBeNull();
    const audit = await h.client.auditLog.findFirst({ where: { action: 'ROOM_RELEASE', entityId: roomId } });
    expect(audit).not.toBeNull();

    const again = await request(h.app)
      .post(`/api/rooms/${roomId}/releases`)
      .set('Cookie', admin)
      .send({ patientId, reason });
    expect(again.status).toBe(409);
  });

  it('revierte una asignación si falla la auditoría', async () => {
    const roomId = await createRoom();
    const patientId = await createPatient();
    await h.breakAudit();
    try {
      const res = await request(h.app)
        .post(`/api/rooms/${roomId}/assignments`)
        .set('Cookie', admin)
        .send({ patientId });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('La operación no se completó.');
    } finally {
      await h.restoreAudit();
    }
    expect(await h.client.roomAssignment.count({ where: { roomId, patientId } })).toBe(0);
  });

  it('revierte cierre, estado y movimiento si falla la auditoría de liberación', async () => {
    const roomId = await createRoom();
    const patientId = await createPatient();
    await assign(roomId, patientId);
    const movementsBefore = await h.client.patientMovement.count({ where: { patientId } });

    await h.breakAudit();
    try {
      const res = await request(h.app)
        .post(`/api/rooms/${roomId}/releases`)
        .set('Cookie', admin)
        .send({ patientId, reason: 'alta' });
      expect(res.status).toBe(500);
    } finally {
      await h.restoreAudit();
    }
    const assignment = await h.client.roomAssignment.findFirstOrThrow({ where: { roomId, patientId } });
    expect(assignment.endedAt).toBeNull();
    expect((await h.client.patient.findUniqueOrThrow({ where: { id: patientId } })).status).toBe('activo');
    expect(await h.client.patientMovement.count({ where: { patientId } })).toBe(movementsBefore);
  });
});

describe('Habitaciones: contadores e historial', () => {
  it('filtra, pagina, resume y mantiene ocupadas + disponibles = total', async () => {
    const roomId = await createRoom();
    const patientId = await createPatient();
    await assign(roomId, patientId);

    const counters = await request(h.app).get('/api/rooms/counters').set('Cookie', admin);
    expect(counters.status).toBe(200);
    expect(counters.body.data.total.occupied + counters.body.data.total.available).toBe(counters.body.data.total.total);
    for (const department of counters.body.data.byDepartment) {
      expect(department.occupied + department.available).toBe(department.total);
    }

    const history = await request(h.app)
      .get('/api/occupancy-history')
      .set('Cookie', admin)
      .query({ departmentId: h.departments.urgencias, roomId, from: today(), to: today(), pageSize: 1 });
    expect(history.status).toBe(200);
    expect(history.body).toMatchObject({ page: 1, pageSize: 1 });
    expect(history.body.total).toBeGreaterThanOrEqual(1);
    expect(history.body.data[0]).toMatchObject({ roomId, patientId, releaseReason: null });

    const summary = await request(h.app)
      .get('/api/occupancy-history/summary')
      .set('Cookie', admin)
      .query({ departmentId: h.departments.urgencias, from: today(), to: today() });
    expect(summary.status).toBe(200);
    const row = summary.body.data.find((item: { departmentId: number }) => item.departmentId === h.departments.urgencias);
    expect(row.started).toBeGreaterThanOrEqual(1);
    expect(row.active).toBeGreaterThanOrEqual(1);

    const invalidRange = await request(h.app)
      .get('/api/occupancy-history')
      .set('Cookie', admin)
      .query({ from: '2026-02-02', to: '2026-01-01' });
    expect(invalidRange.status).toBe(400);
  });
});
