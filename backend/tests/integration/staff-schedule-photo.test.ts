// Pruebas de integración de Horario_de_Trabajo y fotos de Perfil (tarea 6.3; Req. 5.7, 5.13–5.16, 12.1, 12.2).
// Supertest contra la aplicación real con SQLite y carpetas temporales.

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_PHOTO_BYTES } from '../../src/domain/files';
import { DEFAULT_PHOTO_URL, isValidPhotoFilename, photoFilenameOf } from '../../src/domain/staff';
import { createStaffHarness, jpegBytes, pngBytes, type StaffHarness, type UserKey } from '../helpers/staff-harness';

let h: StaffHarness;
const cookies: Partial<Record<UserKey, string>> = {};
const as = async (key: UserKey) => (cookies[key] ??= await h.sid(key));

const auditRows = (where: Record<string, unknown> = {}) => h.client.auditLog.findMany({ where, orderBy: { id: 'asc' } });

beforeAll(async () => {
  h = await createStaffHarness();
}, 120_000);

afterAll(async () => {
  await h?.cleanup();
});

describe('PUT /api/staff/:id/schedule', () => {
  const validSchedule = {
    days: [
      {
        dayOfWeek: 3,
        startTime: '08:00',
        endTime: '16:00',
        mealStart: '12:00',
        mealEnd: '12:45',
        breaks: [{ startTime: '10:00', endTime: '10:15' }],
      },
      {
        dayOfWeek: 1,
        startTime: '07:00',
        endTime: '15:00',
        mealStart: '11:00',
        mealEnd: '11:30',
        breaks: [
          { startTime: '09:00', endTime: '09:15' },
          { startTime: '13:30', endTime: '13:45' },
        ],
      },
    ],
  };

  it('exige sesión (401), cambio de contraseña (403) y solo permite al propio Empleado o ADMIN (403 para otro Empleado)', async () => {
    expect((await request(h.app).put(`/api/staff/${h.users.doctor1.id}/schedule`).send(validSchedule)).status).toBe(401);
    expect((await request(h.app).put(`/api/staff/${h.users.pending.id}/schedule`).set('Cookie', await as('pending')).send(validSchedule)).body.code).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );
    for (const target of [h.users.nurse.id, h.users.admin.id, 999999, 'abc']) {
      const res = await request(h.app).put(`/api/staff/${target}/schedule`).set('Cookie', await as('doctor1')).send(validSchedule);
      expect(res.status, String(target)).toBe(403);
    }
  });

  it('guarda el horario del propio Empleado y del ADMIN para otro Empleado, ordenado por día y auditado', async () => {
    const own = await request(h.app).put(`/api/staff/${h.users.doctor1.id}/schedule`).set('Cookie', await as('doctor1')).send(validSchedule);
    expect(own.status).toBe(200);
    expect(own.body.data.map((d: { dayOfWeek: number }) => d.dayOfWeek)).toEqual([1, 3]);
    expect(own.body.data[0].breaks).toEqual([
      { startTime: '09:00', endTime: '09:15' },
      { startTime: '13:30', endTime: '13:45' },
    ]);

    const getRes = await request(h.app).get(`/api/staff/${h.users.doctor1.id}`).set('Cookie', await as('doctor1'));
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.schedule).toEqual(own.body.data);

    const byAdmin = await request(h.app)
      .put(`/api/staff/${h.users.nurse.id}/schedule`)
      .set('Cookie', await as('admin'))
      .send({ days: [{ dayOfWeek: 2, startTime: '14:00', endTime: '22:00', mealStart: null, mealEnd: null, breaks: [] }] });
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.data).toHaveLength(1);

    const logs = await auditRows({ action: 'EMPLOYEE_UPDATE', entityId: h.users.nurse.id });
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(JSON.parse(logs[logs.length - 1]?.details ?? '{}')).toEqual({ fields: ['schedule'] });
  });

  it('rechaza un horario inválido con 400 por campo y conserva el horario anterior', async () => {
    const before = (await request(h.app).get(`/api/staff/${h.users.doctor1.id}`).set('Cookie', await as('doctor1'))).body.data.schedule;

    const badCases: [unknown, string][] = [
      [{ days: [{ dayOfWeek: 1, startTime: '16:00', endTime: '08:00', breaks: [] }] }, 'days.0.endTime'],
      [
        {
          days: [
            {
              dayOfWeek: 1,
              startTime: '08:00',
              endTime: '16:00',
              mealStart: '12:00',
              mealEnd: '13:00',
              breaks: [{ startTime: '12:30', endTime: '12:45' }],
            },
          ],
        },
        'days.0.breaks.0',
      ],
      [
        {
          days: [
            { dayOfWeek: 1, startTime: '08:00', endTime: '16:00', breaks: [] },
            { dayOfWeek: 1, startTime: '09:00', endTime: '17:00', breaks: [] },
          ],
        },
        'days.1.dayOfWeek',
      ],
      [
        {
          days: [
            {
              dayOfWeek: 1,
              startTime: '08:00',
              endTime: '16:00',
              breaks: [
                { startTime: '09:00', endTime: '09:10' },
                { startTime: '10:00', endTime: '10:10' },
                { startTime: '11:00', endTime: '11:10' },
                { startTime: '14:00', endTime: '14:10' },
              ],
            },
          ],
        },
        'days.0.breaks',
      ],
    ];

    for (const [body, expectedField] of badCases) {
      const res = await request(h.app).put(`/api/staff/${h.users.doctor1.id}/schedule`).set('Cookie', await as('doctor1')).send(body as object);
      expect(res.status, expectedField).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.errors.map((e: { field: string }) => e.field)).toContain(expectedField);
    }

    const after = (await request(h.app).get(`/api/staff/${h.users.doctor1.id}`).set('Cookie', await as('doctor1'))).body.data.schedule;
    expect(after).toEqual(before);
  });

  it('ADMIN no puede modificar horario de otro ADMIN (409), 404 si no existe y 500 revierte si falla auditoría', async () => {
    expect((await request(h.app).put(`/api/staff/${h.users.admin2.id}/schedule`).set('Cookie', await as('admin')).send({ days: [] })).status).toBe(409);
    expect((await request(h.app).put('/api/staff/999999/schedule').set('Cookie', await as('admin')).send({ days: [] })).status).toBe(404);

    const before = (await request(h.app).get(`/api/staff/${h.users.doctor1.id}`).set('Cookie', await as('doctor1'))).body.data.schedule;
    await h.breakAudit();
    try {
      const res = await request(h.app).put(`/api/staff/${h.users.doctor1.id}/schedule`).set('Cookie', await as('doctor1')).send({ days: [] });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('La operación no se completó.');
    } finally {
      await h.restoreAudit();
    }
    const after = (await request(h.app).get(`/api/staff/${h.users.doctor1.id}`).set('Cookie', await as('doctor1'))).body.data.schedule;
    expect(after).toEqual(before);
  });
});

describe('POST /api/staff/:id/photo y GET /api/uploads/photos/:filename', () => {
  it('exige sesión, cambio de contraseña y solo el propio Empleado o ADMIN pueden cargar foto', async () => {
    expect((await request(h.app).post(`/api/staff/${h.users.nurse.id}/photo`).attach('file', pngBytes(), { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
    expect(
      (
        await request(h.app)
          .post(`/api/staff/${h.users.pending.id}/photo`)
          .set('Cookie', await as('pending'))
          .attach('file', pngBytes(), { filename: 'a.png', contentType: 'image/png' })
      ).body.code,
    ).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(
      (
        await request(h.app)
          .post(`/api/staff/${h.users.nurse.id}/photo`)
          .set('Cookie', await as('doctor1'))
          .attach('file', pngBytes(), { filename: 'a.png', contentType: 'image/png' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(h.app)
          .post(`/api/staff/${h.users.admin2.id}/photo`)
          .set('Cookie', await as('admin'))
          .attach('file', pngBytes(), { filename: 'a.png', contentType: 'image/png' })
      ).status,
    ).toBe(409);
  });

  it('carga una foto PNG válida, la sirve autenticada y reemplaza la anterior borrando el archivo previo', async () => {
    const first = pngBytes(128);
    const up1 = await request(h.app)
      .post(`/api/staff/${h.users.nurse.id}/photo`)
      .set('Cookie', await as('nurse'))
      .attach('file', first, { filename: 'perfil.png', contentType: 'image/png' });
    expect(up1.status).toBe(200);
    const url1 = up1.body.data.photoUrl as string;
    const file1 = photoFilenameOf(url1);
    expect(file1).not.toBeNull();
    expect(isValidPhotoFilename(file1)).toBe(true);
    expect(file1?.endsWith('.png')).toBe(true);
    expect(existsSync(join(h.photosDir, file1 as string))).toBe(true);

    // El archivo nunca es público: sin sesión da 401; cualquier rol autenticado puede verlo.
    expect((await request(h.app).get(url1)).status).toBe(401);
    expect((await request(h.app).get(url1).set('Cookie', await as('pending'))).body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const fetched = await request(h.app).get(url1).set('Cookie', await as('doctor1'));
    expect(fetched.status).toBe(200);
    expect(fetched.headers['content-type']).toMatch(/^image\/png/);
    expect(fetched.headers['x-content-type-options']).toBe('nosniff');
    expect(fetched.headers['content-disposition']).toBe('inline');
    expect(Buffer.compare(Buffer.from(fetched.body), first)).toBe(0);

    // Reemplazo con JPEG por ADMIN: borra la foto anterior.
    const second = jpegBytes(160);
    const up2 = await request(h.app)
      .post(`/api/staff/${h.users.nurse.id}/photo`)
      .set('Cookie', await as('admin'))
      .attach('file', second, { filename: 'nueva.jpg', contentType: 'image/jpeg' });
    expect(up2.status).toBe(200);
    const url2 = up2.body.data.photoUrl as string;
    const file2 = photoFilenameOf(url2);
    expect(file2?.endsWith('.jpg')).toBe(true);
    expect(existsSync(join(h.photosDir, file1 as string))).toBe(false);
    expect(existsSync(join(h.photosDir, file2 as string))).toBe(true);

    const fetched2 = await request(h.app).get(url2).set('Cookie', await as('cleaner'));
    expect(fetched2.status).toBe(200);
    expect(fetched2.headers['content-type']).toMatch(/^image\/jpeg/);
    expect(Buffer.compare(Buffer.from(fetched2.body), second)).toBe(0);
  });

  it('rechaza foto de más de 2 MB, firma falsa, tipo inválido o campo faltante con 400 y conserva la foto anterior', async () => {
    const before = (await request(h.app).get(`/api/staff/${h.users.nurse.id}`).set('Cookie', await as('nurse'))).body.data.photoUrl as string;
    expect(before).not.toBe(DEFAULT_PHOTO_URL);
    const filesBefore = readdirSync(h.photosDir);

    const tooBig = await request(h.app)
      .post(`/api/staff/${h.users.nurse.id}/photo`)
      .set('Cookie', await as('nurse'))
      .attach('file', pngBytes(MAX_PHOTO_BYTES + 1), { filename: 'grande.png', contentType: 'image/png' });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.errors[0].field).toBe('file');

    const spoofed = await request(h.app)
      .post(`/api/staff/${h.users.nurse.id}/photo`)
      .set('Cookie', await as('nurse'))
      .attach('file', Buffer.from('%PDF-1.4 falso'), { filename: 'falso.png', contentType: 'image/png' });
    expect(spoofed.status).toBe(400);
    expect(spoofed.body.errors[0].field).toBe('file');

    const mismatch = await request(h.app)
      .post(`/api/staff/${h.users.nurse.id}/photo`)
      .set('Cookie', await as('nurse'))
      .attach('file', pngBytes(64), { filename: 'mal.jpg', contentType: 'image/jpeg' });
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.errors[0].field).toBe('file');

    const missing = await request(h.app).post(`/api/staff/${h.users.nurse.id}/photo`).set('Cookie', await as('nurse'));
    expect(missing.status).toBe(400);
    expect(missing.body.errors[0].field).toBe('file');

    const after = (await request(h.app).get(`/api/staff/${h.users.nurse.id}`).set('Cookie', await as('nurse'))).body.data.photoUrl;
    expect(after).toBe(before);
    expect(readdirSync(h.photosDir)).toEqual(filesBefore);
  });

  it('si falla la auditoría al subir foto, revierte la BD, borra el archivo nuevo y conserva la foto anterior', async () => {
    const before = (await request(h.app).get(`/api/staff/${h.users.nurse.id}`).set('Cookie', await as('nurse'))).body.data.photoUrl as string;
    const filesBefore = readdirSync(h.photosDir);

    await h.breakAudit();
    try {
      const res = await request(h.app)
        .post(`/api/staff/${h.users.nurse.id}/photo`)
        .set('Cookie', await as('nurse'))
        .attach('file', pngBytes(64), { filename: 'ok.png', contentType: 'image/png' });
      expect(res.status).toBe(500);
      expect(res.body.message).toBe('La operación no se completó.');
    } finally {
      await h.restoreAudit();
    }

    const after = (await request(h.app).get(`/api/staff/${h.users.nurse.id}`).set('Cookie', await as('nurse'))).body.data.photoUrl;
    expect(after).toBe(before);
    expect(readdirSync(h.photosDir)).toEqual(filesBefore);
  });

  it('GET /api/uploads/photos/:filename rechaza nombres inválidos o traversal con 404 sin leer disco', async () => {
    writeFileSync(join(h.photosDir, '..', 'secreto.png'), 'secreto');
    for (const bad of [
      'foto.png',
      '3f2b8c1e-9d4a-4b6f-8a21-5c7e0d9b1a42.svg',
      '3F2B8C1E-9D4A-4B6F-8A21-5C7E0D9B1A42.png',
      '..%2Fsecreto.png',
      '..%5Csecreto.png',
      '3f2b8c1e-9d4a-4b6f-8a21-5c7e0d9b1a42.png',
    ]) {
      const res = await request(h.app).get(`/api/uploads/photos/${bad}`).set('Cookie', await as('admin'));
      expect(res.status, bad).toBe(404);
    }
  });

  it('responde 405 con Allow en métodos no permitidos', async () => {
    const r1 = await request(h.app).get(`/api/staff/${h.users.nurse.id}/schedule`).set('Cookie', await as('admin'));
    expect(r1.status).toBe(405);
    expect(r1.headers.allow).toBe('PUT');

    const r2 = await request(h.app).delete(`/api/staff/${h.users.nurse.id}/photo`).set('Cookie', await as('admin'));
    expect(r2.status).toBe(405);
    expect(r2.headers.allow).toBe('POST');

    const r3 = await request(h.app).delete('/api/uploads/photos/x.png').set('Cookie', await as('admin'));
    expect(r3.status).toBe(405);
    expect(r3.headers.allow).toBe('GET, HEAD');
  });
});
