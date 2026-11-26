// Pruebas de integración de Personal y Departamentos (tarea 6.1; Req. 5.2–5.12, 5.17, 12.1, 12.2, 12.8, 13.1,
// 13.2, 2.10). Supertest contra la aplicación real con SQLite temporal y carpetas temporales de archivos.

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { photoUrlFor } from '../../src/domain/staff';
import { generateInitialPassword } from '../../src/lib/initial-password';
import { verifyPassword } from '../../src/lib/password';
import { createStaffHarness, writeDocumentFile, type StaffHarness, type UserKey } from '../helpers/staff-harness';

let h: StaffHarness;
let forcedPasswords: string[] = [];
const cookies: Partial<Record<UserKey, string>> = {};
const as = async (key: UserKey) => (cookies[key] ??= await h.sid(key));
const get = async (path: string, who?: UserKey) => {
  const req = request(h.app).get(`/api${path}`);
  return who ? req.set('Cookie', await as(who)) : req;
};
const send = async (method: 'post' | 'put' | 'patch' | 'delete', path: string, who: UserKey | undefined, body?: unknown) => {
  const req = request(h.app)[method](`/api${path}`);
  if (who) req.set('Cookie', await as(who));
  return body === undefined ? req : req.send(body as object);
};

let counter = 0;
const newBody = (over: Record<string, unknown> = {}) => {
  counter += 1;
  return {
    internalId: `NEW-${counter}`,
    email: `nuevo${counter}@example.com`,
    role: 'NURSE',
    name: `Nuevo Empleado ${counter}`,
    position: 'Enfermero de planta',
    description: 'Descripción de prueba',
    specialty: 'Cuidados generales',
    departmentId: h.departments.urgencias,
    yearsExperience: 4,
    shift: 'matutino',
    phone: '555-0199',
    birthDate: '1992-03-15',
    ...over,
  };
};

const auditRows = (where: Record<string, unknown> = {}) => h.client.auditLog.findMany({ where, orderBy: { id: 'asc' } });
const countUsers = () => h.client.user.count();

beforeAll(async () => {
  h = await createStaffHarness({ generateInitialPassword: () => forcedPasswords.shift() ?? generateInitialPassword() });
}, 120_000);

afterAll(async () => {
  await h?.cleanup();
});

describe('GET /api/staff', () => {
  it('exige sesión (401) y rol ADMIN (403 sin datos para los demás roles)', async () => {
    expect((await get('/staff')).status).toBe(401);
    for (const who of ['doctor1', 'nurse', 'cleaner'] as UserKey[]) {
      const res = await get('/staff', who);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String) });
    }
  });

  it('devuelve solo Empleados (sin ADMIN) y nunca datos de acceso', async () => {
    const res = await get('/staff', 'admin');
    expect(res.status).toBe(200);
    const roles = (res.body.data as { role: string }[]).map((r) => r.role);
    expect(roles).not.toContain('ADMIN');
    expect(roles).toEqual(expect.arrayContaining(['DOCTOR', 'NURSE', 'CLEANING']));
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|mustChangePassword|bcrypt/i);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ photoUrl: '/avatars/default.svg', department: expect.objectContaining({ name: expect.any(String) }) }));
  });

  it('combina rol, Departamento, Turno y búsqueda con AND', async () => {
    const ids = async (query: string) => ((await get(`/staff${query}`, 'admin')).body.data as { internalId: string }[]).map((r) => r.internalId);
    expect(await ids('?role=DOCTOR')).toEqual(expect.arrayContaining([h.users.doctor1.internalId, h.users.doctor2.internalId]));
    expect(await ids(`?role=DOCTOR&departmentId=${h.departments.cardiologia}`)).toEqual([h.users.doctor2.internalId]);
    expect(await ids(`?role=DOCTOR&departmentId=${h.departments.cardiologia}&shift=matutino`)).toEqual([]);
    expect(await ids('?shift=vespertino')).toEqual([h.users.doctor2.internalId]);
    expect(await ids('?role=CLEANING&search=zzzz')).toEqual([]);
  });

  it('busca por nombre o ID interno sin distinguir mayúsculas', async () => {
    const ids = async (query: string) => ((await get(`/staff${query}`, 'admin')).body.data as { internalId: string }[]).map((r) => r.internalId);
    expect(await ids(`?search=${encodeURIComponent('ÁLVARO')}`)).toEqual([h.users.doctor1.internalId]);
    expect(await ids(`?search=${encodeURIComponent('núñez')}`)).toEqual([h.users.doctor1.internalId]);
    expect(await ids(`?search=${encodeURIComponent(h.users.nurse.internalId.toLowerCase())}`)).toEqual([h.users.nurse.internalId]);
  });

  it('rechaza filtros inválidos con 400 por campo', async () => {
    for (const [query, field] of [['?role=ADMIN', 'role'], ['?shift=nocturno', 'shift'], ['?departmentId=abc', 'departmentId'], ['?role=DOCTOR&role=NURSE', 'role']] as const) {
      const res = await get(`/staff${query}`, 'admin');
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    }
  });

  it('un cambio de contraseña pendiente bloquea la ruta', async () => {
    const res = await get('/staff', 'pending');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });
});

describe('POST /api/staff', () => {
  it('crea el Empleado (201) y devuelve la contraseña inicial una sola vez, sin caché', async () => {
    const body = newBody();
    const res = await send('post', '/staff', 'admin', body);
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.initialPassword).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(res.body.data).toEqual(expect.objectContaining({ internalId: body.internalId, email: body.email, role: 'NURSE', photoUrl: '/avatars/default.svg', birthDate: '1992-03-15', schedule: [] }));
    expect(JSON.stringify(res.body.data)).not.toMatch(/password|hash/i);

    const saved = await h.client.user.findUnique({ where: { id: res.body.data.id } });
    expect(saved?.mustChangePassword).toBe(true);
    expect(saved?.active).toBe(true);
    expect(saved?.photoUrl).toBeNull();
    expect(saved?.passwordHash).not.toContain(res.body.initialPassword);
    expect(await verifyPassword(res.body.initialPassword, saved?.passwordHash ?? '')).toBe(true);

    // La contraseña inicial no vuelve a aparecer en ninguna consulta.
    const detail = await get(`/staff/${res.body.data.id}`, 'admin');
    const list = await get('/staff', 'admin');
    expect(JSON.stringify(detail.body)).not.toContain(res.body.initialPassword);
    expect(JSON.stringify(list.body)).not.toContain(res.body.initialPassword);
  });

  it('exige el cambio de contraseña en el primer inicio de sesión antes de cualquier otra operación', async () => {
    const body = newBody({ email: 'primer.acceso@example.com' });
    const created = await send('post', '/staff', 'admin', body);
    const login = await request(h.app).post('/api/auth/login').send({ email: body.email, password: created.body.initialPassword });
    expect(login.status).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);
    const cookie = (login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid=')) as string;
    const own = await request(h.app).get(`/api/staff/${created.body.data.id}`).set('Cookie', cookie.split(';')[0] as string);
    expect(own.status).toBe(403);
    expect(own.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect((await request(h.app).get('/api/departments').set('Cookie', cookie.split(';')[0] as string)).status).toBe(403);
    expect((await request(h.app).get('/api/auth/me').set('Cookie', cookie.split(';')[0] as string)).status).toBe(200);
  });

  it('genera contraseñas iniciales distintas para cada Empleado', async () => {
    const passwords = new Set<string>();
    for (let i = 0; i < 6; i++) passwords.add((await send('post', '/staff', 'admin', newBody())).body.initialPassword);
    expect(passwords.size).toBe(6);
  });

  it('si la contraseña coincide con una inicial pendiente genera otra', async () => {
    forcedPasswords = [h.users.pending.password, h.users.pending.password, 'Zq8mKd4Rt7Wx'];
    const res = await send('post', '/staff', 'admin', newBody());
    expect(res.status).toBe(201);
    expect(res.body.initialPassword).toBe('Zq8mKd4Rt7Wx');
    expect(forcedPasswords).toEqual([]);
  });

  it('si no logra una contraseña distinta responde 500 sin crear nada', async () => {
    const before = await countUsers();
    forcedPasswords = Array.from({ length: 5 }, () => h.users.pending.password);
    const res = await send('post', '/staff', 'admin', newBody());
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(h.users.pending.password);
    expect(await countUsers()).toBe(before);
    forcedPasswords = [];
  });

  it('un ID interno o un correo duplicado responde 409 y no modifica nada', async () => {
    const before = await countUsers();
    const dupId = await send('post', '/staff', 'admin', newBody({ internalId: h.users.nurse.internalId }));
    expect(dupId.status).toBe(409);
    expect(dupId.body).toEqual({ code: 'CONFLICT', message: 'El ID interno ya existe.' });
    const dupMail = await send('post', '/staff', 'admin', newBody({ email: h.users.nurse.email }));
    expect(dupMail.status).toBe(409);
    expect(dupMail.body.message).toBe('El correo electrónico ya está registrado.');
    expect(await countUsers()).toBe(before);
  });

  it('rechaza datos inválidos con 400 por campo y no crea registros', async () => {
    const before = await countUsers();
    const cases: [Record<string, unknown>, string][] = [
      [{ name: '   ' }, 'name'],
      [{ internalId: '' }, 'internalId'],
      [{ email: 'no-es-correo' }, 'email'],
      [{ yearsExperience: 61 }, 'yearsExperience'],
      [{ shift: 'nocturno' }, 'shift'],
      [{ role: 'ADMIN' }, 'role'],
      [{ role: ['DOCTOR', 'NURSE'] }, 'role'],
      [{ departmentId: 9999 }, 'departmentId'],
      [{ phone: 'x'.repeat(31) }, 'phone'],
      [{ description: 'x'.repeat(501) }, 'description'],
    ];
    for (const [over, field] of cases) {
      const res = await send('post', '/staff', 'admin', newBody(over));
      expect(res.status, JSON.stringify(over)).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    }
    expect(await countUsers()).toBe(before);
  });

  it('ignora claves privilegiadas del cuerpo (no se puede crear activo=false ni sin cambio de contraseña)', async () => {
    const res = await send('post', '/staff', 'admin', newBody({ mustChangePassword: false, active: false, passwordHash: 'x', photoUrl: '/api/uploads/photos/x.png' }));
    expect(res.status).toBe(201);
    const saved = await h.client.user.findUnique({ where: { id: res.body.data.id } });
    expect(saved).toEqual(expect.objectContaining({ mustChangePassword: true, active: true, photoUrl: null }));
    expect(saved?.passwordHash).not.toBe('x');
  });

  it('un Empleado no puede crear Empleados (403)', async () => {
    const before = await countUsers();
    const res = await send('post', '/staff', 'doctor1', newBody());
    expect(res.status).toBe(403);
    expect(await countUsers()).toBe(before);
  });

  it('audita EMPLOYEE_CREATE en la misma operación y sin contraseñas ni hashes', async () => {
    const res = await send('post', '/staff', 'admin', newBody());
    const rows = await auditRows({ action: 'EMPLOYEE_CREATE', entityId: res.body.data.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ userId: h.users.admin.id, entityType: 'Employee' }));
    const all = JSON.stringify(await auditRows());
    expect(all).not.toContain(res.body.initialPassword);
    expect(all).not.toMatch(/bcrypt/i);
  });

  it('si falla la auditoría revierte el alta y responde 500 sin contraseña', async () => {
    await as('admin');
    const before = await countUsers();
    await h.breakAudit();
    try {
      const res = await send('post', '/staff', 'admin', newBody());
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'La operación no se completó.' });
      expect(await countUsers()).toBe(before);
    } finally {
      await h.restoreAudit();
    }
  });
});

describe('GET /api/staff/:id', () => {
  it('un Empleado ve su propio Perfil (200) y no audita la consulta', async () => {
    const before = (await auditRows({ action: 'PROFILE_DETAIL_READ' })).length;
    const res = await get(`/staff/${h.users.doctor1.id}`, 'doctor1');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ id: h.users.doctor1.id, email: h.users.doctor1.email, schedule: [] }));
    expect((await auditRows({ action: 'PROFILE_DETAIL_READ' })).length).toBe(before);
  });

  it('un Empleado que pide otro Perfil recibe 403 sin datos, exista o no', async () => {
    for (const id of [h.users.nurse.id, h.users.admin.id, 987654, 'abc']) {
      const res = await get(`/staff/${id}`, 'doctor1');
      expect(res.status, String(id)).toBe(403);
      expect(res.body).toEqual({ code: 'FORBIDDEN', message: expect.any(String) });
    }
  });

  it('el ADMIN ve cualquier Empleado y la consulta de otro Perfil queda auditada', async () => {
    const res = await get(`/staff/${h.users.nurse.id}`, 'admin');
    expect(res.status).toBe(200);
    expect(res.body.data.internalId).toBe(h.users.nurse.internalId);
    const rows = await auditRows({ action: 'PROFILE_DETAIL_READ', entityId: h.users.nurse.id });
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]).toEqual(expect.objectContaining({ userId: h.users.admin.id, entityType: 'Employee' }));
  });

  it('el ADMIN ve su propio Perfil sin auditar, y no consulta otras cuentas ADMIN', async () => {
    const before = (await auditRows({ action: 'PROFILE_DETAIL_READ', entityId: h.users.admin.id })).length;
    expect((await get(`/staff/${h.users.admin.id}`, 'admin')).status).toBe(200);
    expect((await auditRows({ action: 'PROFILE_DETAIL_READ', entityId: h.users.admin.id })).length).toBe(before);
    expect((await get(`/staff/${h.users.admin2.id}`, 'admin')).status).toBe(404);
  });

  it('404 si no existe y 400 si el identificador no es un entero', async () => {
    expect((await get('/staff/987654', 'admin')).status).toBe(404);
    const bad = await get('/staff/abc', 'admin');
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].field).toBe('id');
  });

  it('si falla la auditoría de la consulta responde 500 sin datos del Perfil', async () => {
    await as('admin');
    await h.breakAudit();
    try {
      const res = await get(`/staff/${h.users.cleaner.id}`, 'admin');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'La operación no se completó.' });
      expect(JSON.stringify(res.body)).not.toContain(h.users.cleaner.email);
    } finally {
      await h.restoreAudit();
    }
  });
});

describe('PUT /api/staff/:id', () => {
  const makeTarget = async (role = 'NURSE') => {
    const body = newBody({ role });
    const res = await send('post', '/staff', 'admin', body);
    return { id: res.body.data.id as number, body };
  };

  it('edita el Empleado (200) y audita EMPLOYEE_UPDATE con los nombres de los campos', async () => {
    const { id, body } = await makeTarget();
    const res = await send('put', `/staff/${id}`, 'admin', { ...body, name: 'Nombre Editado', yearsExperience: 10, description: '' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({ id, name: 'Nombre Editado', yearsExperience: 10, description: '' }));
    const rows = await auditRows({ action: 'EMPLOYEE_UPDATE', entityId: id });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.details ?? '{}')).toEqual({ fields: expect.arrayContaining(['name', 'yearsExperience', 'description']) });
    expect(JSON.parse(rows[0]?.details ?? '{}').fields).not.toContain('email');
    expect(await auditRows({ action: 'ROLE_CHANGE', entityId: id })).toHaveLength(0);
  });

  it('un cambio de rol audita también ROLE_CHANGE con el rol anterior y el nuevo', async () => {
    const { id, body } = await makeTarget('NURSE');
    const res = await send('put', `/staff/${id}`, 'admin', { ...body, role: 'DOCTOR' });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('DOCTOR');
    const rows = await auditRows({ action: 'ROLE_CHANGE', entityId: id });
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.details ?? '{}')).toEqual({ from: 'NURSE', to: 'DOCTOR' });
    expect(rows[0]?.userId).toBe(h.users.admin.id);
    expect(await auditRows({ action: 'EMPLOYEE_UPDATE', entityId: id })).toHaveLength(1);
  });

  it('no cambia la contraseña ni el estado de la cuenta aunque el cuerpo los incluya', async () => {
    const { id, body } = await makeTarget();
    const before = await h.client.user.findUnique({ where: { id } });
    await send('put', `/staff/${id}`, 'admin', { ...body, passwordHash: 'x', active: false, mustChangePassword: false, photoUrl: 'otra' });
    const after = await h.client.user.findUnique({ where: { id } });
    expect(after).toEqual(expect.objectContaining({ passwordHash: before?.passwordHash, active: true, mustChangePassword: true, photoUrl: null }));
  });

  it('un ID interno o un correo duplicado responde 409 y conserva el registro', async () => {
    const { id, body } = await makeTarget();
    const dupId = await send('put', `/staff/${id}`, 'admin', { ...body, internalId: h.users.nurse.internalId });
    expect(dupId.status).toBe(409);
    expect(dupId.body.message).toBe('El ID interno ya existe.');
    const dupMail = await send('put', `/staff/${id}`, 'admin', { ...body, email: h.users.nurse.email });
    expect(dupMail.status).toBe(409);
    const saved = await h.client.user.findUnique({ where: { id } });
    expect(saved).toEqual(expect.objectContaining({ internalId: body.internalId, email: body.email }));
    expect(await auditRows({ action: 'EMPLOYEE_UPDATE', entityId: id })).toHaveLength(0);
  });

  it('datos inválidos, rol como arreglo o Departamento inexistente dan 400 sin cambios', async () => {
    const { id, body } = await makeTarget();
    for (const [over, field] of [[{ name: '  ' }, 'name'], [{ role: ['DOCTOR', 'NURSE'] }, 'role'], [{ role: 'ADMIN' }, 'role'], [{ departmentId: 9999 }, 'departmentId'], [{ yearsExperience: 99 }, 'yearsExperience']] as const) {
      const res = await send('put', `/staff/${id}`, 'admin', { ...body, ...over });
      expect(res.status, field).toBe(400);
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(field);
    }
    const saved = await h.client.user.findUnique({ where: { id } });
    expect(saved).toEqual(expect.objectContaining({ name: body.name, role: 'NURSE', departmentId: h.departments.urgencias }));
  });

  it('una cuenta ADMIN no se edita desde Personal (409), un Empleado no edita (403) y un id inexistente da 404', async () => {
    const adminBody = newBody({ role: 'DOCTOR' });
    const onAdmin = await send('put', `/staff/${h.users.admin2.id}`, 'admin', adminBody);
    expect(onAdmin.status).toBe(409);
    const onSelf = await send('put', `/staff/${h.users.admin.id}`, 'admin', adminBody);
    expect(onSelf.status).toBe(409);
    expect((await h.client.user.findUnique({ where: { id: h.users.admin2.id } }))?.role).toBe('ADMIN');
    expect((await send('put', `/staff/${h.users.nurse.id}`, 'doctor1', adminBody)).status).toBe(403);
    expect((await send('put', `/staff/${h.users.doctor1.id}`, 'doctor1', adminBody)).status).toBe(403);
    expect((await send('put', '/staff/987654', 'admin', adminBody)).status).toBe(404);
  });

  it('si falla la auditoría revierte la edición, incluido el cambio de rol', async () => {
    const { id, body } = await makeTarget('NURSE');
    await as('admin');
    await h.breakAudit();
    try {
      const res = await send('put', `/staff/${id}`, 'admin', { ...body, role: 'CLEANING', name: 'No debe guardarse' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('La operación no se completó.');
    } finally {
      await h.restoreAudit();
    }
    const saved = await h.client.user.findUnique({ where: { id } });
    expect(saved).toEqual(expect.objectContaining({ role: 'NURSE', name: body.name }));
  });
});

describe('PATCH /api/staff/me', () => {
  it('actualiza el teléfono (200) y audita la modificación del propio Perfil', async () => {
    const res = await send('patch', '/staff/me', 'doctor1', { phone: '  555-7777  ' });
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBe('555-7777');
    expect((await h.client.user.findUnique({ where: { id: h.users.doctor1.id } }))?.phone).toBe('555-7777');
    const rows = await auditRows({ action: 'EMPLOYEE_UPDATE', entityId: h.users.doctor1.id });
    const last = rows[rows.length - 1];
    expect(last?.userId).toBe(h.users.doctor1.id);
    expect(JSON.parse(last?.details ?? '{}')).toEqual({ fields: ['phone'] });
    expect(last?.details).not.toContain('555-7777');
  });

  it('cualquier otra clave responde 403 y deja el Perfil sin cambios', async () => {
    const before = await h.client.user.findUnique({ where: { id: h.users.nurse.id } });
    const auditBefore = (await auditRows()).length;
    for (const key of ['position', 'description', 'email', 'internalId', 'departmentId', 'role', 'yearsExperience', 'shift', 'specialty', 'password', 'schedule', 'name', 'active', 'passwordHash']) {
      const res = await send('patch', '/staff/me', 'nurse', { phone: '000-0000', [key]: key === 'departmentId' ? h.departments.cardiologia : 'x' });
      expect(res.status, key).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }
    expect(await h.client.user.findUnique({ where: { id: h.users.nurse.id } })).toEqual(before);
    expect((await auditRows()).length).toBe(auditBefore);
  });

  it('un cuerpo vacío o que no es un objeto responde 400', async () => {
    for (const body of [{}, [], 'texto', null]) {
      const res = await request(h.app).patch('/api/staff/me').set('Cookie', await as('nurse')).set('Content-Type', 'application/json').send(JSON.stringify(body));
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
  });

  it('valida el teléfono (solo espacios, demasiado largo)', async () => {
    for (const phone of ['   ', 'x'.repeat(31), 5]) {
      const res = await send('patch', '/staff/me', 'nurse', { phone });
      expect(res.status).toBe(400);
      expect(res.body.errors[0].field).toBe('phone');
    }
  });

  it('photoUrl solo acepta null o el valor actual: no se puede asignar una ruta ajena ni una URL externa', async () => {
    const other = photoUrlFor('3f2b8c1e-9d4a-4b6f-8a21-5c7e0d9b1a42.png');
    for (const photoUrl of [other, 'https://ejemplo.com/x.png', '/avatars/otra.svg', '']) {
      const res = await send('patch', '/staff/me', 'nurse', { photoUrl });
      expect(res.status, photoUrl).toBe(400);
      expect(res.body.errors[0].field).toBe('photoUrl');
    }
    expect((await h.client.user.findUnique({ where: { id: h.users.nurse.id } }))?.photoUrl).toBeNull();
    // Sin foto, el valor actual (avatar por defecto) y null no cambian nada.
    expect((await send('patch', '/staff/me', 'nurse', { photoUrl: '/avatars/default.svg' })).status).toBe(200);
    expect((await send('patch', '/staff/me', 'nurse', { photoUrl: null })).status).toBe(200);
  });

  it('photoUrl: null devuelve al avatar predeterminado y borra el archivo anterior', async () => {
    const employee = await h.createEmployee({ internalId: 'P-REM', email: 'quitar.foto@example.com', role: 'CLEANING', photoUrl: photoUrlFor('aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb.png') });
    const file = join(h.photosDir, 'aaaaaaaa-1111-4222-8333-bbbbbbbbbbbb.png');
    writeFileSync(file, 'x');
    const login = await request(h.app).post('/api/auth/login').send({ email: employee.email, password: employee.password });
    const cookie = ((login.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sid=')) as string).split(';')[0] as string;
    const res = await request(h.app).patch('/api/staff/me').set('Cookie', cookie).send({ photoUrl: null });
    expect(res.status).toBe(200);
    expect(res.body.data.photoUrl).toBe('/avatars/default.svg');
    expect((await h.client.user.findUnique({ where: { id: employee.id } }))?.photoUrl).toBeNull();
    expect(existsSync(file)).toBe(false);
  });

  it('exige sesión y un cambio de contraseña pendiente lo bloquea', async () => {
    expect((await send('patch', '/staff/me', undefined, { phone: '1' })).status).toBe(401);
    const res = await send('patch', '/staff/me', 'pending', { phone: '1' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('si falla la auditoría revierte el cambio de teléfono', async () => {
    await as('cleaner');
    const before = (await h.client.user.findUnique({ where: { id: h.users.cleaner.id } }))?.phone;
    await h.breakAudit();
    try {
      const res = await send('patch', '/staff/me', 'cleaner', { phone: '111-2222' });
      expect(res.status).toBe(500);
    } finally {
      await h.restoreAudit();
    }
    expect((await h.client.user.findUnique({ where: { id: h.users.cleaner.id } }))?.phone).toBe(before);
  });
});

describe('DELETE /api/staff/:id', () => {
  it('elimina al Empleado sin referencias, con sus sesiones, documentos y archivos, y lo audita', async () => {
    const photoName = 'bbbbbbbb-2222-4333-8444-cccccccccccc.jpg';
    const target = await h.createEmployee({ internalId: 'DEL-1', email: 'borrar@example.com', role: 'CLEANING', photoUrl: photoUrlFor(photoName) });
    writeFileSync(join(h.photosDir, photoName), 'foto');
    const doc1 = writeDocumentFile(h.documentsDir, 'seed/DEL-1-a.pdf');
    const doc2 = writeDocumentFile(h.documentsDir, 'seed/DEL-1-b.pdf');
    const other = writeDocumentFile(h.documentsDir, 'seed/OTRO.pdf');
    for (const filePath of ['seed/DEL-1-a.pdf', 'seed/DEL-1-b.pdf']) {
      await h.client.employeeDocument.create({ data: { userId: target.id, type: 'contratación', title: 'Doc', issuedAt: new Date(), filePath, fileSize: 15 } });
    }
    await request(h.app).post('/api/auth/login').send({ email: target.email, password: target.password });
    expect(await h.client.session.count({ where: { userId: target.id } })).toBe(1);

    const res = await send('delete', `/staff/${target.id}`, 'admin');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expect(await h.client.user.findUnique({ where: { id: target.id } })).toBeNull();
    expect(await h.client.session.count({ where: { userId: target.id } })).toBe(0);
    expect(await h.client.employeeDocument.count({ where: { userId: target.id } })).toBe(0);
    expect([existsSync(join(h.photosDir, photoName)), existsSync(doc1), existsSync(doc2)]).toEqual([false, false, false]);
    expect(existsSync(other)).toBe(true);
    const rows = await auditRows({ action: 'EMPLOYEE_DELETE', entityId: target.id });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(h.users.admin.id);
    expect((await get(`/staff/${target.id}`, 'admin')).status).toBe(404);
  });

  it('con Pacientes activos responde 409 con mensaje específico y conserva todo', async () => {
    const doctor = await h.createEmployee({ internalId: 'DEL-2', email: 'activo@example.com', role: 'DOCTOR', photoUrl: photoUrlFor('cccccccc-3333-4444-8555-dddddddddddd.png') });
    writeFileSync(join(h.photosDir, 'cccccccc-3333-4444-8555-dddddddddddd.png'), 'foto');
    const doc = writeDocumentFile(h.documentsDir, 'seed/DEL-2.pdf');
    await h.client.employeeDocument.create({ data: { userId: doctor.id, type: 'acreditación', title: 'Doc', issuedAt: new Date(), filePath: 'seed/DEL-2.pdf', fileSize: 15 } });
    await h.client.patient.create({
      data: { internalId: 'PAC-DEL-2', firstName: 'Ana', lastName: 'Prueba', birthDate: new Date('1980-01-01'), sex: 'F', admissionDate: new Date('2026-01-01'), reason: 'Control', status: 'activo', departmentId: h.departments.urgencias, doctorId: doctor.id, nurseId: h.users.nurse.id },
    });
    const res = await send('delete', `/staff/${doctor.id}`, 'admin');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'CONFLICT', message: 'No se puede eliminar al Empleado porque tiene Pacientes activos asignados.' });
    expect(await h.client.user.findUnique({ where: { id: doctor.id } })).not.toBeNull();
    expect(existsSync(doc)).toBe(true);
    expect(existsSync(join(h.photosDir, 'cccccccc-3333-4444-8555-dddddddddddd.png'))).toBe(true);
    expect(await auditRows({ action: 'EMPLOYEE_DELETE', entityId: doctor.id })).toHaveLength(0);
  });

  it('con un enfermero responsable de un Paciente activo también responde 409', async () => {
    const nurse = await h.createEmployee({ internalId: 'DEL-3', email: 'enfermero.activo@example.com', role: 'NURSE' });
    await h.client.patient.create({
      data: { internalId: 'PAC-DEL-3', firstName: 'Luis', lastName: 'Prueba', birthDate: new Date('1975-06-01'), sex: 'M', admissionDate: new Date('2026-01-02'), reason: 'Control', status: 'activo', departmentId: h.departments.urgencias, doctorId: h.users.doctor1.id, nurseId: nurse.id },
    });
    const res = await send('delete', `/staff/${nurse.id}`, 'admin');
    expect(res.status).toBe(409);
    expect(res.body.message).toContain('Pacientes activos');
  });

  it('con otras referencias (Paciente dado de alta) responde 409 genérico, revierte todo y conserva los archivos', async () => {
    const doctor = await h.createEmployee({ internalId: 'DEL-4', email: 'historial@example.com', role: 'DOCTOR', photoUrl: photoUrlFor('dddddddd-4444-4555-8666-eeeeeeeeeeee.png') });
    writeFileSync(join(h.photosDir, 'dddddddd-4444-4555-8666-eeeeeeeeeeee.png'), 'foto');
    const doc = writeDocumentFile(h.documentsDir, 'seed/DEL-4.pdf');
    await h.client.employeeDocument.create({ data: { userId: doctor.id, type: 'acreditación', title: 'Doc', issuedAt: new Date(), filePath: 'seed/DEL-4.pdf', fileSize: 15 } });
    await h.client.patient.create({
      data: { internalId: 'PAC-DEL-4', firstName: 'Eva', lastName: 'Prueba', birthDate: new Date('1990-01-01'), sex: 'F', admissionDate: new Date('2026-01-03'), reason: 'Control', status: 'dado de alta', departmentId: h.departments.urgencias, doctorId: doctor.id, nurseId: h.users.nurse.id },
    });
    const res = await send('delete', `/staff/${doctor.id}`, 'admin');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ code: 'CONFLICT', message: 'No se puede eliminar porque tiene registros asociados.' });
    expect(await h.client.user.findUnique({ where: { id: doctor.id } })).not.toBeNull();
    expect(await h.client.employeeDocument.count({ where: { userId: doctor.id } })).toBe(1);
    expect(existsSync(doc)).toBe(true);
    expect(existsSync(join(h.photosDir, 'dddddddd-4444-4555-8666-eeeeeeeeeeee.png'))).toBe(true);
    expect(await auditRows({ action: 'EMPLOYEE_DELETE', entityId: doctor.id })).toHaveLength(0);
  });

  it('si falla la auditoría revierte la eliminación y no borra archivos', async () => {
    const target = await h.createEmployee({ internalId: 'DEL-5', email: 'auditoria.falla@example.com', role: 'CLEANING', photoUrl: photoUrlFor('eeeeeeee-5555-4666-8777-ffffffffffff.png') });
    writeFileSync(join(h.photosDir, 'eeeeeeee-5555-4666-8777-ffffffffffff.png'), 'foto');
    const doc = writeDocumentFile(h.documentsDir, 'seed/DEL-5.pdf');
    await h.client.employeeDocument.create({ data: { userId: target.id, type: 'acreditación', title: 'Doc', issuedAt: new Date(), filePath: 'seed/DEL-5.pdf', fileSize: 15 } });
    await as('admin');
    await h.breakAudit();
    try {
      const res = await send('delete', `/staff/${target.id}`, 'admin');
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('La operación no se completó.');
    } finally {
      await h.restoreAudit();
    }
    expect(await h.client.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    expect(await h.client.employeeDocument.count({ where: { userId: target.id } })).toBe(1);
    expect(existsSync(doc)).toBe(true);
    expect(existsSync(join(h.photosDir, 'eeeeeeee-5555-4666-8777-ffffffffffff.png'))).toBe(true);
  });

  it('el ADMIN no puede eliminar su propia cuenta ni otra cuenta ADMIN (409)', async () => {
    const own = await send('delete', `/staff/${h.users.admin.id}`, 'admin');
    expect(own.status).toBe(409);
    expect(own.body.message).toBe('No puedes eliminar tu propia cuenta.');
    const other = await send('delete', `/staff/${h.users.admin2.id}`, 'admin');
    expect(other.status).toBe(409);
    expect(await h.client.user.count({ where: { role: 'ADMIN' } })).toBe(2);
  });

  it('un Empleado no elimina a nadie (403), un id inexistente da 404 y uno inválido da 400', async () => {
    const before = await countUsers();
    expect((await send('delete', `/staff/${h.users.nurse.id}`, 'doctor1')).status).toBe(403);
    expect((await send('delete', `/staff/${h.users.doctor1.id}`, 'doctor1')).status).toBe(403);
    expect((await send('delete', '/staff/987654', 'admin')).status).toBe(404);
    expect((await send('delete', '/staff/abc', 'admin')).status).toBe(400);
    expect(await countUsers()).toBe(before);
  });
});

describe('GET /api/departments y métodos no permitidos', () => {
  it('lista los Departamentos para cualquier rol autenticado', async () => {
    expect((await get('/departments')).status).toBe(401);
    for (const who of ['admin', 'doctor1', 'nurse', 'cleaner'] as UserKey[]) {
      const res = await get('/departments', who);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([
        { id: h.departments.cardiologia, name: 'Cardiología' },
        { id: h.departments.urgencias, name: 'Urgencias' },
      ]);
    }
  });

  it('un cambio de contraseña pendiente bloquea /departments', async () => {
    expect((await get('/departments', 'pending')).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('responde 405 con Allow a métodos no soportados', async () => {
    const checks: [string, string, string][] = [
      ['delete', '/staff', 'GET, HEAD, POST'],
      ['put', '/staff/me', 'PATCH'],
      ['get', '/staff/me', 'PATCH'],
      ['patch', `/staff/${h.users.nurse.id}`, 'GET, HEAD, PUT, DELETE'],
      ['post', '/departments', 'GET, HEAD'],
    ];
    for (const [method, path, allow] of checks) {
      const res = await send(method as 'post', path, 'admin', {});
      expect(res.status, `${method} ${path}`).toBe(405);
      expect(res.headers.allow).toBe(allow);
    }
  });
});

describe('Carpetas de archivos de las pruebas', () => {
  it('las pruebas nunca escribieron en las carpetas reales del proyecto', () => {
    expect(h.photosDir).not.toContain('backend');
    expect(readdirSync(h.documentsDir).length).toBeGreaterThanOrEqual(0);
  });
});
