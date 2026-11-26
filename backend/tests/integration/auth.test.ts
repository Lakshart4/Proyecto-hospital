// Pruebas de integración de autenticación y middlewares de seguridad (tareas 4.19, 4.20 y primera parte
// de 4.25; Req. 1.1–1.11, 2.1, 2.2, 2.7, 5.12, 12.2, 13.1, 18.5).
// Usan supertest contra la aplicación real con una base SQLite temporal (migraciones reales, sin
// simulaciones) y un reloj controlado. Contraseñas, secretos y tokens se generan en cada ejecución.

import { createHmac, randomBytes } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword, passwordHashFormat, verifyPassword } from '../../src/lib/password';
import { generateToken, hashToken } from '../../src/lib/tokens';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

const SECRET = randomBytes(32).toString('hex');
const ORIGIN = 'http://localhost:5173';
const MIN = 60_000;
const pw = () => randomBytes(12).toString('base64url');

const PASSWORDS = { doctor: pw(), nurse: pw(), cleaning: pw(), admin: pw(), pending: pw(), inactive: pw() };
const EMAILS = {
  doctor: 'medico.auth@example.com',
  nurse: 'enfermera.auth@example.com',
  cleaning: 'limpieza.auth@example.com',
  admin: 'director.auth@example.com',
  pending: 'pendiente.auth@example.com',
  inactive: 'inactivo.auth@example.com',
};
type Who = keyof typeof EMAILS;

let db: TempDatabase | undefined;
const client = () => (db as TempDatabase).client;
const ids: Partial<Record<Who, number>> = {};
let clock = Date.UTC(2026, 4, 4, 9, 0, 0);

/** Firma una cookie como cookie-parser (`s:` + valor + `.` + HMAC-SHA256 en base64 sin relleno). */
function signCookie(name: string, value: string, secret = SECRET): string {
  const signature = createHmac('sha256', secret).update(value).digest('base64').replace(/=+$/, '');
  return `${name}=${encodeURIComponent(`s:${value}.${signature}`)}`;
}

const setCookies = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? (header as string[]) : typeof header === 'string' ? [header] : [];
};
const cookieOf = (res: request.Response, name: string) => setCookies(res).find((c) => c.startsWith(`${name}=`));
/** Token en claro de la cookie `sid` firmada (para buscar su hash en la base). */
function tokenOf(sidCookie: string): string {
  const raw = decodeURIComponent(sidCookie.split(';')[0]!.slice('sid='.length));
  return raw.slice(2, raw.lastIndexOf('.'));
}
const cookieHeader = (sidCookie: string) => sidCookie.split(';')[0]!;

function newApp(): Express {
  return createApp({
    corsOrigin: ORIGIN,
    sessionSecret: SECRET,
    db: client(),
    now: () => new Date(clock),
    bcryptCost: BCRYPT_TEST_COST,
    logError: () => undefined,
    extraRoutes: (router, security) => {
      router.get('/test/patients', ...security.protect('patients', 'list'), (_req, res) => {
        res.json({ data: ['dato-protegido'] });
      });
      router.get('/test/employee-documents', ...security.protect('employeeDocuments', 'read'), security.requireAdminAuthorization, (_req, res) => {
        res.json({ data: ['documento-protegido'] });
      });
    },
  });
}

async function login(app: Express, who: Who, password = PASSWORDS[who]) {
  return request(app).post('/api/auth/login').send({ email: EMAILS[who], password });
}

async function loggedIn(app: Express, who: Who): Promise<string> {
  const res = await login(app, who);
  expect(res.status).toBe(200);
  return cookieOf(res, 'sid') as string;
}

beforeAll(async () => {
  db = createTempDatabase('hm-auth-');
  const department = await client().department.create({ data: { name: 'Urgencias' } });
  const roles: Record<Who, string> = { doctor: 'DOCTOR', nurse: 'NURSE', cleaning: 'CLEANING', admin: 'ADMIN', pending: 'DOCTOR', inactive: 'NURSE' };
  let n = 1;
  for (const who of Object.keys(EMAILS) as Who[]) {
    const user = await client().user.create({
      data: {
        internalId: `AUTH-${n++}`,
        email: EMAILS[who],
        passwordHash: await hashPassword(PASSWORDS[who], BCRYPT_TEST_COST),
        role: roles[who],
        active: who !== 'inactive',
        mustChangePassword: who === 'pending',
        name: `Usuario ${who}`,
        position: 'Cargo',
        specialty: 'General',
        departmentId: department.id,
        yearsExperience: 1,
        shift: 'matutino',
        phone: '5550000000',
      },
    });
    ids[who] = user.id;
  }
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(async () => {
  clock += 60 * MIN;
  await client().adminAuthorization.deleteMany();
  await client().session.deleteMany();
  await client().auditLog.deleteMany();
});

describe('POST /api/auth/login', () => {
  it('con credenciales válidas crea la Sesión y fija la cookie sid firmada, HttpOnly, SameSite=Strict, Path=/ y sin Max-Age', async () => {
    const res = await login(newApp(), 'doctor');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: ids.doctor, email: EMAILS.doctor, name: 'Usuario doctor', role: 'DOCTOR', mustChangePassword: false } });

    const sid = cookieOf(res, 'sid') as string;
    expect(sid).toBeDefined();
    expect(sid).toMatch(/^sid=s%3A/);
    expect(sid).toContain('HttpOnly');
    expect(sid).toContain('SameSite=Strict');
    expect(sid).toContain('Path=/');
    expect(sid).not.toMatch(/Max-Age|Expires|Secure/i);

    // La base guarda solo el hash del token.
    const token = tokenOf(sid);
    expect(token).toHaveLength(43);
    const sessions = await client().session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(sessions)).not.toContain(token);

    const audit = await client().auditLog.findMany();
    expect(audit).toMatchObject([{ userId: ids.doctor, action: 'LOGIN_SUCCESS', entityType: 'Session', entityId: sessions[0]!.id }]);
  });

  it('en producción la cookie lleva además Secure', async () => {
    const app = createApp({ corsOrigin: ORIGIN, sessionSecret: SECRET, secureCookies: true, db: client(), now: () => new Date(clock), bcryptCost: BCRYPT_TEST_COST });
    const res = await login(app, 'doctor');
    expect(cookieOf(res, 'sid')).toContain('Secure');
  });

  it('contraseña incorrecta, cuenta inexistente y cuenta inactiva dan el mismo 401 genérico sin Sesión ni cookie', async () => {
    const app = newApp();
    const responses = [
      await login(app, 'doctor', pw()),
      await request(app).post('/api/auth/login').send({ email: 'nadie@example.com', password: pw() }),
      await login(app, 'inactive'),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: 'Credenciales incorrectas.' });
      expect(cookieOf(res, 'sid')).toBeUndefined();
    }
    expect(await client().session.count()).toBe(0);

    const audit = await client().auditLog.findMany({ orderBy: { id: 'asc' } });
    expect(audit.map((a) => [a.action, a.userId, JSON.parse(a.details)])).toEqual([
      ['LOGIN_FAILURE', ids.doctor, { email: EMAILS.doctor }],
      ['LOGIN_FAILURE', null, { email: 'nadie@example.com' }],
      ['LOGIN_FAILURE', ids.inactive, { email: EMAILS.inactive }],
    ]);
  });

  it('datos faltantes dan 400 por campo y no cuentan como intento fallido', async () => {
    const app = newApp();
    for (let i = 0; i < 6; i++) {
      const res = await request(app).post('/api/auth/login').send({ email: EMAILS.doctor });
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([{ field: 'password', message: 'Este campo es obligatorio.' }]);
    }
    expect((await login(app, 'doctor')).status).toBe(200);
  });
});

describe('Límite de intentos del inicio de sesión', () => {
  it('el quinto fallo bloquea la IP con 429 aunque las credenciales sean válidas', async () => {
    const app = newApp();
    for (let i = 0; i < 5; i++) expect((await login(app, 'doctor', pw())).status).toBe(401);
    const blocked = await login(app, 'doctor');
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(cookieOf(blocked, 'sid')).toBeUndefined();
  });

  it('las solicitudes bloqueadas no prolongan el bloqueo: termina 15 min después del quinto fallo', async () => {
    const app = newApp();
    for (let i = 0; i < 5; i++) expect((await login(app, 'doctor', pw())).status).toBe(401);
    const fifth = clock;
    for (const offset of [5 * MIN, 10 * MIN, 15 * MIN - 1]) {
      clock = fifth + offset;
      expect((await login(app, 'doctor', pw())).status).toBe(429);
    }
    clock = fifth + 15 * MIN;
    expect((await login(app, 'doctor')).status).toBe(200);
  });

  it('un inicio de sesión correcto reinicia el contador', async () => {
    const app = newApp();
    for (let i = 0; i < 4; i++) expect((await login(app, 'doctor', pw())).status).toBe(401);
    expect((await login(app, 'doctor')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login(app, 'doctor', pw())).status).toBe(401);
    expect((await login(app, 'doctor')).status).toBe(200);
  });
});

describe('Sesión: /me, logout, expiración y cookies inválidas', () => {
  it('GET /me devuelve el usuario con la cookie y 401 sin datos sin ella', async () => {
    const app = newApp();
    const sid = await loggedIn(app, 'nurse');
    const ok = await request(app).get('/api/auth/me').set('Cookie', cookieHeader(sid));
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ id: ids.nurse, role: 'NURSE' });
    expect(JSON.stringify(ok.body)).not.toMatch(/hash/i);

    const none = await request(app).get('/api/auth/me');
    expect(none.status).toBe(401);
    expect(none.body).toEqual({ code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.' });
  });

  it('una cookie con firma alterada, sin firma o firmada con otro secreto recibe 401 y se borran las cookies', async () => {
    const app = newApp();
    const sid = await loggedIn(app, 'nurse');
    const token = tokenOf(sid);
    const header = cookieHeader(sid);
    const tampered = header.slice(0, -2) + (header.endsWith('A') ? 'B' : 'A') + header.slice(-1);
    for (const cookie of [tampered, `sid=${token}`, signCookie('sid', token, randomBytes(32).toString('hex'))]) {
      const res = await request(app).get('/api/auth/me').set('Cookie', cookie);
      expect(res.status).toBe(401);
      expect(cookieOf(res, 'sid')).toMatch(/^sid=;/);
    }
    // La firma correcta calculada aparte coincide con la de la aplicación.
    expect((await request(app).get('/api/auth/me').set('Cookie', signCookie('sid', token))).status).toBe(200);
  });

  it('logout responde 204, borra la Sesión y las cookies; el mismo sid recibe 401', async () => {
    const app = newApp();
    const sid = await loggedIn(app, 'doctor');
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookieHeader(sid));
    expect(out.status).toBe(204);
    expect(cookieOf(out, 'sid')).toMatch(/^sid=;/);
    expect(cookieOf(out, 'aid')).toMatch(/^aid=;/);
    expect(await client().session.count()).toBe(0);
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieHeader(sid))).status).toBe(401);
  });

  it('30 minutos exactos de inactividad no expiran; 30 minutos y 1 ms sí, y la Sesión se borra', async () => {
    const app = newApp();
    const sid = await loggedIn(app, 'doctor');
    clock += 30 * MIN;
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieHeader(sid))).status).toBe(200);
    clock += 30 * MIN + 1;
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieHeader(sid))).status).toBe(401);
    expect(await client().session.count()).toBe(0);
  });

  it('si la cuenta se desactiva, la Sesión deja de valer con 401 y se borra', async () => {
    const app = newApp();
    const sid = await loggedIn(app, 'cleaning');
    await client().user.update({ where: { id: ids.cleaning }, data: { active: false } });
    try {
      expect((await request(app).get('/api/auth/me').set('Cookie', cookieHeader(sid))).status).toBe(401);
      expect(await client().session.count()).toBe(0);
    } finally {
      await client().user.update({ where: { id: ids.cleaning }, data: { active: true } });
    }
  });

  it('una Sesión borrada en el servidor (revocada) recibe 401', async () => {
    const app = newApp();
    const sid = await loggedIn(app, 'doctor');
    await client().session.deleteMany();
    expect((await request(app).get('/api/auth/me').set('Cookie', cookieHeader(sid))).status).toBe(401);
  });
});

describe('RBAC, cambio de contraseña pendiente y orden de errores', () => {
  it('sin Sesión: 401 antes que cualquier 403 o 400', async () => {
    const app = newApp();
    expect((await request(app).get('/api/test/patients')).status).toBe(401);
    expect((await request(app).get('/api/test/employee-documents')).status).toBe(401);
    expect((await request(app).post('/api/auth/change-password').send({})).status).toBe(401);
  });

  it('un rol sin permiso recibe 403 sin datos del recurso; uno con permiso, 200', async () => {
    const app = newApp();
    const cleaning = await request(app).get('/api/test/patients').set('Cookie', cookieHeader(await loggedIn(app, 'cleaning')));
    expect(cleaning.status).toBe(403);
    expect(cleaning.body).toEqual({ code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' });
    expect(cleaning.text).not.toContain('dato-protegido');
    const doctor = await request(app).get('/api/test/patients').set('Cookie', cookieHeader(await loggedIn(app, 'doctor')));
    expect(doctor.status).toBe(200);
  });

  it('con cambio de contraseña pendiente: 403 PASSWORD_CHANGE_REQUIRED salvo /me, /logout y /change-password', async () => {
    const app = newApp();
    const sid = cookieHeader(await loggedIn(app, 'pending'));
    const blocked = await request(app).get('/api/test/patients').set('Cookie', sid);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
    expect(blocked.text).not.toContain('dato-protegido');
    const me = await request(app).get('/api/auth/me').set('Cookie', sid);
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);

    const next = pw();
    const changed = await request(app).post('/api/auth/change-password').set('Cookie', sid).send({ currentPassword: PASSWORDS.pending, newPassword: next });
    expect(changed.status).toBe(200);
    PASSWORDS.pending = next;
    expect((await request(app).get('/api/test/patients').set('Cookie', sid)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', sid)).body.user.mustChangePassword).toBe(false);
    expect((await request(app).post('/api/auth/logout').set('Cookie', sid)).status).toBe(204);
  });
});

describe('POST /api/auth/change-password', () => {
  it('una contraseña nueva de 7 caracteres se rechaza con mensaje y el hash no cambia', async () => {
    const app = newApp();
    const sid = cookieHeader(await loggedIn(app, 'nurse'));
    const before = (await client().user.findUniqueOrThrow({ where: { id: ids.nurse } })).passwordHash;
    const short = randomBytes(8).toString('hex').slice(0, 7);
    const res = await request(app).post('/api/auth/change-password').set('Cookie', sid).send({ currentPassword: PASSWORDS.nurse, newPassword: short });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'newPassword', message: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' }]);
    expect((await client().user.findUniqueOrThrow({ where: { id: ids.nurse } })).passwordHash).toBe(before);
  });

  it('con la contraseña actual incorrecta responde 400 y el hash no cambia', async () => {
    const app = newApp();
    const sid = cookieHeader(await loggedIn(app, 'nurse'));
    const before = (await client().user.findUniqueOrThrow({ where: { id: ids.nurse } })).passwordHash;
    const res = await request(app).post('/api/auth/change-password').set('Cookie', sid).send({ currentPassword: pw(), newPassword: pw() });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual([{ field: 'currentPassword', message: 'La contraseña actual es incorrecta.' }]);
    expect((await client().user.findUniqueOrThrow({ where: { id: ids.nurse } })).passwordHash).toBe(before);
  });

  it('con éxito conserva la Sesión actual, borra las demás, revoca las autorizaciones y audita sin secretos', async () => {
    const app = newApp();
    const current = cookieHeader(await loggedIn(app, 'admin'));
    const other = cookieHeader(await loggedIn(app, 'admin'));
    const session = await client().session.findUniqueOrThrow({ where: { tokenHash: hashToken(tokenOf(current)) } });
    const aid = generateToken();
    await client().adminAuthorization.create({ data: { sessionId: session.id, userId: ids.admin!, tokenHash: hashToken(aid), expiresAt: new Date(clock + 10 * MIN) } });

    const next = pw();
    const res = await request(app).post('/api/auth/change-password').set('Cookie', current).send({ currentPassword: PASSWORDS.admin, newPassword: next });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'La contraseña se cambió correctamente.' });

    const user = await client().user.findUniqueOrThrow({ where: { id: ids.admin } });
    expect(passwordHashFormat(user.passwordHash)).toBe('bcrypt-sha256');
    expect(await verifyPassword(next, user.passwordHash)).toBe(true);
    expect((await request(app).get('/api/auth/me').set('Cookie', current)).status).toBe(200);
    expect((await request(app).get('/api/auth/me').set('Cookie', other)).status).toBe(401);
    expect((await client().adminAuthorization.findFirstOrThrow()).revokedAt).not.toBeNull();

    const audit = await client().auditLog.findMany({ where: { action: 'PASSWORD_CHANGE' } });
    expect(audit).toMatchObject([{ userId: ids.admin, entityType: 'User', entityId: ids.admin }]);
    const allAudit = JSON.stringify(await client().auditLog.findMany());
    for (const secretValue of [PASSWORDS.admin, next, tokenOf(current), aid]) expect(allAudit).not.toContain(secretValue);
    PASSWORDS.admin = next;
  });
});

describe('requireAdminAuthorization', () => {
  async function adminWithAuthorization(app: Express, expiresInMs = 10 * MIN) {
    const sid = cookieHeader(await loggedIn(app, 'admin'));
    const session = await client().session.findUniqueOrThrow({ where: { tokenHash: hashToken(tokenOf(sid)) } });
    const aid = generateToken();
    const row = await client().adminAuthorization.create({
      data: { sessionId: session.id, userId: ids.admin!, tokenHash: hashToken(aid), expiresAt: new Date(clock + expiresInMs) },
    });
    return { sid, aid, row };
  }
  const get = (app: Express, ...cookies: string[]) => request(app).get('/api/test/employee-documents').set('Cookie', cookies.join('; '));

  it('sin cookie aid el ADMIN recibe 403 AUTORIZACION_ADMIN_REQUERIDA sin datos', async () => {
    const app = newApp();
    const { sid } = await adminWithAuthorization(app);
    const res = await get(app, sid);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('AUTORIZACION_ADMIN_REQUERIDA');
    expect(res.text).not.toContain('documento-protegido');
  });

  it('con una autorización vigente de su Sesión accede; vencida o revocada recibe 403 sin cerrar la Sesión', async () => {
    const app = newApp();
    const { sid, aid, row } = await adminWithAuthorization(app);
    expect((await get(app, sid, signCookie('aid', aid))).status).toBe(200);

    clock += 10 * MIN; // instante exacto de vencimiento: ya no es válida
    const expired = await get(app, sid, signCookie('aid', aid));
    expect(expired.status).toBe(403);
    expect(expired.body.code).toBe('AUTORIZACION_ADMIN_REQUERIDA');
    expect((await request(app).get('/api/auth/me').set('Cookie', sid)).status).toBe(200);

    await client().adminAuthorization.update({ where: { id: row.id }, data: { expiresAt: new Date(clock + 5 * MIN), revokedAt: new Date(clock) } });
    expect((await get(app, sid, signCookie('aid', aid))).status).toBe(403);
  });

  it('una autorización de otra Sesión o una cookie aid alterada no sirven', async () => {
    const app = newApp();
    const { aid } = await adminWithAuthorization(app);
    const otherSid = cookieHeader(await loggedIn(app, 'admin'));
    expect((await get(app, otherSid, signCookie('aid', aid))).status).toBe(403);
    expect((await get(app, otherSid, `aid=${aid}`)).status).toBe(403);
  });

  it('un rol distinto de ADMIN recibe 403 FORBIDDEN antes de revisar la autorización', async () => {
    const app = newApp();
    const res = await get(app, cookieHeader(await loggedIn(app, 'doctor')));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });
});
