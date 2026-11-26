// Pruebas de integración de recuperación de contraseña y Autorización_Administrativa (tareas 4.22–4.24 y
// segunda parte de 4.25; Req. 17, 18, 12.2). Supertest contra la aplicación real, SQLite temporal con las
// migraciones reales, Bandeja_Local real y reloj controlado. Contraseñas y tokens se generan en cada
// ejecución.

import { createHmac, randomBytes } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword, verifyPassword } from '../../src/lib/password';
import { hashToken } from '../../src/lib/tokens';
import { createMailService, type MailService } from '../../src/mail/mail.service';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

const SECRET = randomBytes(32).toString('hex');
const MIN = 60_000;
const pw = () => randomBytes(12).toString('base64url');
const RESET_OK = { message: 'Si el correo corresponde a una cuenta activa, recibirás un enlace para restablecer tu contraseña.' };
const INVALID_LINK = { code: 'VALIDATION_ERROR', message: 'El enlace es inválido o venció.', errors: [{ field: 'token', message: 'El enlace es inválido o venció.' }] };

const PASSWORDS = { admin: pw(), doctor: pw(), inactive: pw(), reset: pw() };
const EMAILS = { admin: 'director.b5@example.com', doctor: 'medico.b5@example.com', inactive: 'inactivo.b5@example.com', reset: 'recupera.b5@example.com' };
type Who = keyof typeof EMAILS;

let db: TempDatabase | undefined;
const client = () => (db as TempDatabase).client;
const ids: Partial<Record<Who, number>> = {};
let clock = Date.UTC(2026, 5, 1, 8, 0, 0);
let mail: MailService;
let mailLogs: string[] = [];

function signCookie(name: string, value: string): string {
  const signature = createHmac('sha256', SECRET).update(value).digest('base64').replace(/=+$/, '');
  return `${name}=${encodeURIComponent(`s:${value}.${signature}`)}`;
}
const setCookies = (res: request.Response): string[] => {
  const header = res.headers['set-cookie'] as unknown;
  return Array.isArray(header) ? (header as string[]) : typeof header === 'string' ? [header] : [];
};
const cookieOf = (res: request.Response, name: string) => setCookies(res).find((c) => c.startsWith(`${name}=`));
const pair = (cookie: string) => cookie.split(';')[0]!;
function unsigned(cookie: string): string {
  const raw = decodeURIComponent(pair(cookie).slice(pair(cookie).indexOf('=') + 1));
  return raw.slice(2, raw.lastIndexOf('.'));
}
/** Último token enviado a la Bandeja_Local para ese correo. */
function lastResetToken(email: string): string {
  const message = [...mail.outbox].reverse().find((m) => m.to === email);
  const match = /token=([^\s]+)/.exec(message?.text ?? '');
  if (!match) throw new Error('No hay correo de recuperación');
  return decodeURIComponent(match[1]!);
}

function newApp(): Express {
  return createApp({
    corsOrigin: 'http://localhost:5173',
    sessionSecret: SECRET,
    db: client(),
    now: () => new Date(clock),
    bcryptCost: BCRYPT_TEST_COST,
    mail,
    frontendUrl: 'http://localhost:5173',
    logError: () => undefined,
    extraRoutes: (router, security) => {
      router.get('/test/employee-documents', ...security.protect('employeeDocuments', 'read'), security.requireAdminAuthorization, (_req, res) => {
        res.json({ data: ['documento-protegido'] });
      });
    },
  });
}

const login = (app: Express, who: Who, password = PASSWORDS[who]) => request(app).post('/api/auth/login').send({ email: EMAILS[who], password });
async function sid(app: Express, who: Who): Promise<string> {
  const res = await login(app, who);
  expect(res.status).toBe(200);
  return pair(cookieOf(res, 'sid') as string);
}
const forgot = (app: Express, email: string) => request(app).post('/api/auth/forgot-password').send({ email });
const reset = (app: Express, token: string, newPassword: string) => request(app).post('/api/auth/reset-password').send({ token, newPassword });
const grant = (app: Express, session: string, password: string) => request(app).post('/api/admin-authorization').set('Cookie', session).send({ password });
const docs = (app: Express, ...cookies: string[]) => request(app).get('/api/test/employee-documents').set('Cookie', cookies.join('; '));

beforeAll(async () => {
  db = createTempDatabase('hm-b5-');
  const department = await client().department.create({ data: { name: 'Dirección' } });
  const roles: Record<Who, string> = { admin: 'ADMIN', doctor: 'DOCTOR', inactive: 'ADMIN', reset: 'NURSE' };
  let n = 1;
  for (const who of Object.keys(EMAILS) as Who[]) {
    const user = await client().user.create({
      data: {
        internalId: `B5-${n++}`,
        email: EMAILS[who],
        passwordHash: await hashPassword(PASSWORDS[who], BCRYPT_TEST_COST),
        role: roles[who],
        active: who !== 'inactive',
        name: `Usuario ${who}`,
        position: 'Cargo',
        specialty: 'General',
        departmentId: department.id,
        yearsExperience: 2,
        shift: 'matutino',
        phone: '5551111111',
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
  mailLogs = [];
  mail = createMailService({ nodeEnv: 'test', smtp: null, log: (line) => mailLogs.push(line) });
  await client().passwordResetToken.deleteMany();
  await client().adminAuthorization.deleteMany();
  await client().session.deleteMany();
  await client().auditLog.deleteMany();
});

// ============================================================
// Recuperación de contraseña
// ============================================================

describe('POST /api/auth/forgot-password', () => {
  it('responde lo mismo con correo existente, inexistente o inactivo; solo la cuenta activa recibe el enlace', async () => {
    const app = newApp();
    const responses = [await forgot(app, EMAILS.reset), await forgot(app, 'nadie.b5@example.com'), await forgot(app, EMAILS.inactive)];
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(res.body).toEqual(RESET_OK);
    }
    expect(mail.outbox.map((m) => m.to)).toEqual([EMAILS.reset]);
    expect(mailLogs[0]).toContain('[Bandeja_Local]');

    const audit = await client().auditLog.findMany();
    expect(audit).toMatchObject([{ action: 'PASSWORD_RESET_REQUEST', userId: ids.reset, entityType: 'User' }]);
  });

  it('guarda solo el hash del token, con vigencia de 30 minutos, y el token no aparece en la base ni en la auditoría', async () => {
    const app = newApp();
    await forgot(app, EMAILS.reset);
    const token = lastResetToken(EMAILS.reset);
    expect(Buffer.from(token, 'base64url').length).toBeGreaterThanOrEqual(32);
    const rows = await client().passwordResetToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: ids.reset, tokenHash: hashToken(token), usedAt: null });
    expect(rows[0]!.expiresAt.getTime()).toBe(clock + 30 * MIN);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(JSON.stringify(await client().auditLog.findMany())).not.toContain(token);
  });

  it('un token nuevo invalida el anterior', async () => {
    const app = newApp();
    await forgot(app, EMAILS.reset);
    const first = lastResetToken(EMAILS.reset);
    await forgot(app, EMAILS.reset);
    const second = lastResetToken(EMAILS.reset);
    expect(second).not.toBe(first);
    expect((await reset(app, first, pw())).body).toEqual(INVALID_LINK);
    const next = pw();
    expect((await reset(app, second, next)).status).toBe(200);
    PASSWORDS.reset = next;
  });

  it('límite propio por IP: la quinta solicitud contada activa el bloqueo y las siguientes reciben 429 hasta 15 min después de ella', async () => {
    const app = newApp();
    const admin = await sid(app, 'admin');
    // Cuatro solicitudes (correo existente, inexistente, inactivo y otro) cuentan y responden 200.
    for (const email of [EMAILS.reset, 'nadie@example.com', EMAILS.inactive, 'otro@example.com']) {
      clock += 1000;
      expect((await forgot(app, email)).status).toBe(200);
    }
    // La quinta (una entrada inválida, 400) también cuenta y activa el bloqueo en su instante.
    clock += 1000;
    const fifth = clock;
    expect((await request(app).post('/api/auth/forgot-password').send({})).status).toBe(400);

    // En el mismo instante del quinto, la siguiente solicitud ya está bloqueada.
    const blocked = await forgot(app, EMAILS.reset);
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    const mailsWhileBlocked = mail.outbox.length;

    // Las solicitudes bloqueadas no prolongan el bloqueo, ni envían correos.
    for (const offset of [1, 5 * MIN, 10 * MIN, 15 * MIN - 1]) {
      clock = fifth + offset;
      expect((await forgot(app, EMAILS.reset)).status).toBe(429);
    }
    expect(mail.outbox.length).toBe(mailsWhileBlocked);

    // Los limitadores de login y de autorización administrativa son independientes.
    expect((await login(app, 'doctor')).status).toBe(200);
    expect((await grant(app, admin, PASSWORDS.admin)).status).toBe(201);

    // A los 15 minutos exactos del quinto, el flujo vuelve a funcionar y el contador empieza de cero.
    clock = fifth + 15 * MIN;
    for (let i = 0; i < 4; i++) expect((await forgot(app, EMAILS.reset)).status).toBe(200);
    expect((await forgot(app, EMAILS.reset)).status).toBe(200);
    expect((await forgot(app, EMAILS.reset)).status).toBe(429);
  });

  it('el bloqueo de login o de autorización administrativa no afecta a la recuperación', async () => {
    const app = newApp();
    const admin = await sid(app, 'admin');
    for (let i = 0; i < 5; i++) expect((await login(app, 'doctor', pw())).status).toBe(401);
    expect((await login(app, 'doctor')).status).toBe(429);
    for (let i = 0; i < 5; i++) expect((await grant(app, admin, pw())).status).toBe(401);
    expect((await grant(app, admin, PASSWORDS.admin)).status).toBe(429);
    expect((await forgot(app, EMAILS.reset)).status).toBe(200);
  });
});

describe('POST /api/auth/reset-password', () => {
  it('restablece, marca el token como usado, borra todas las Sesiones y Autorizaciones, y audita sin secretos', async () => {
    const app = newApp();
    const s1 = await sid(app, 'reset');
    const s2 = await sid(app, 'reset');
    const session = await client().session.findFirstOrThrow({ where: { userId: ids.reset } });
    await client().adminAuthorization.create({ data: { sessionId: session.id, userId: ids.reset!, tokenHash: hashToken(pw()), expiresAt: new Date(clock + 10 * MIN) } });
    await client().user.update({ where: { id: ids.reset }, data: { mustChangePassword: true } });

    await forgot(app, EMAILS.reset);
    const token = lastResetToken(EMAILS.reset);
    const next = pw();
    const res = await reset(app, token, next);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'La contraseña se restableció correctamente. Inicia sesión con tu nueva contraseña.' });

    const user = await client().user.findUniqueOrThrow({ where: { id: ids.reset } });
    expect(await verifyPassword(next, user.passwordHash)).toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect((await client().passwordResetToken.findFirstOrThrow()).usedAt).not.toBeNull();
    expect(await client().session.count({ where: { userId: ids.reset } })).toBe(0);
    expect(await client().adminAuthorization.count({ where: { userId: ids.reset } })).toBe(0);
    for (const cookie of [s1, s2]) expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
    expect((await login(app, 'reset')).status).toBe(401);
    expect((await login(app, 'reset', next)).status).toBe(200);
    expect((await reset(app, token, pw())).body).toEqual(INVALID_LINK); // ya usado

    const audit = await client().auditLog.findMany({ where: { action: { in: ['PASSWORD_RESET_REQUEST', 'PASSWORD_RESET_COMPLETE'] } }, orderBy: { id: 'asc' } });
    expect(audit.map((a) => [a.action, a.userId])).toEqual([['PASSWORD_RESET_REQUEST', ids.reset], ['PASSWORD_RESET_COMPLETE', ids.reset]]);
    const dump = JSON.stringify(await client().auditLog.findMany());
    for (const value of [token, next, PASSWORDS.reset]) expect(dump).not.toContain(value);
    PASSWORDS.reset = next;
  });

  it('un token incorrecto da 400 y la contraseña no cambia', async () => {
    const app = newApp();
    const before = (await client().user.findUniqueOrThrow({ where: { id: ids.reset } })).passwordHash;
    expect((await reset(app, pw(), pw())).body).toEqual(INVALID_LINK);
    expect((await client().user.findUniqueOrThrow({ where: { id: ids.reset } })).passwordHash).toBe(before);
  });

  it('una contraseña de 7 o 129 caracteres da 400 en newPassword y el token sigue vigente', async () => {
    const app = newApp();
    await forgot(app, EMAILS.reset);
    const token = lastResetToken(EMAILS.reset);
    const before = (await client().user.findUniqueOrThrow({ where: { id: ids.reset } })).passwordHash;
    for (const bad of [pw().slice(0, 7), 'x'.repeat(129)]) {
      const res = await reset(app, token, bad);
      expect(res.status).toBe(400);
      expect(res.body.errors).toEqual([{ field: 'newPassword', message: 'La nueva contraseña debe tener entre 8 y 128 caracteres.' }]);
    }
    expect((await client().user.findUniqueOrThrow({ where: { id: ids.reset } })).passwordHash).toBe(before);
    expect((await client().passwordResetToken.findFirstOrThrow()).usedAt).toBeNull();
    const next = pw();
    expect((await reset(app, token, next)).status).toBe(200);
    PASSWORDS.reset = next;
  });

  it('vigencia: válido en el instante exacto de 30 minutos y vencido 1 ms después', async () => {
    const app = newApp();
    await forgot(app, EMAILS.reset);
    const exact = lastResetToken(EMAILS.reset);
    clock += 30 * MIN;
    const next = pw();
    expect((await reset(app, exact, next)).status).toBe(200);
    PASSWORDS.reset = next;

    await forgot(app, EMAILS.reset);
    const late = lastResetToken(EMAILS.reset);
    clock += 30 * MIN + 1;
    const before = (await client().user.findUniqueOrThrow({ where: { id: ids.reset } })).passwordHash;
    expect((await reset(app, late, pw())).body).toEqual(INVALID_LINK);
    expect((await client().user.findUniqueOrThrow({ where: { id: ids.reset } })).passwordHash).toBe(before);
  });
});

// ============================================================
// Autorización_Administrativa
// ============================================================

describe('POST /api/admin-authorization', () => {
  it('con la contraseña correcta otorga 10 minutos ligados a la Sesión, fija aid firmada y audita sin secretos', async () => {
    const app = newApp();
    const session = await sid(app, 'admin');
    const res = await grant(app, session, PASSWORDS.admin);
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ expiresAt: new Date(clock + 10 * MIN).toISOString() });

    const aid = cookieOf(res, 'aid') as string;
    expect(aid).toMatch(/^aid=s%3A/);
    for (const attr of ['HttpOnly', 'SameSite=Strict', 'Path=/']) expect(aid).toContain(attr);
    expect(aid).not.toMatch(/Max-Age|Expires|Secure/i);
    const token = unsigned(aid);
    const rows = await client().adminAuthorization.findMany();
    const sessionRow = await client().session.findUniqueOrThrow({ where: { tokenHash: hashToken(unsigned(session)) } });
    expect(rows).toMatchObject([{ sessionId: sessionRow.id, userId: ids.admin, tokenHash: hashToken(token), revokedAt: null }]);

    expect((await docs(app, session, pair(aid))).status).toBe(200);
    expect((await request(app).get('/api/admin-authorization').set('Cookie', `${session}; ${pair(aid)}`)).body).toEqual({
      active: true,
      expiresAt: new Date(clock + 10 * MIN).toISOString(),
    });

    const audit = await client().auditLog.findMany({ where: { action: 'ADMIN_AUTH_GRANTED' } });
    expect(audit).toMatchObject([{ userId: ids.admin, entityType: 'Session', entityId: sessionRow.id }]);
    const dump = JSON.stringify(await client().auditLog.findMany());
    for (const value of [token, PASSWORDS.admin, unsigned(session), hashToken(token)]) expect(dump).not.toContain(value);
  });

  it('con contraseña incorrecta responde 401, no otorga nada y audita el rechazo sin la contraseña', async () => {
    const app = newApp();
    const session = await sid(app, 'admin');
    const wrong = pw();
    const res = await grant(app, session, wrong);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'UNAUTHENTICATED', message: 'La contraseña es incorrecta.' });
    expect(cookieOf(res, 'aid')).toBeUndefined();
    expect(await client().adminAuthorization.count()).toBe(0);
    const audit = await client().auditLog.findMany({ where: { action: 'ADMIN_AUTH_REJECTED' } });
    expect(audit).toMatchObject([{ userId: ids.admin, entityType: 'Session' }]);
    expect(JSON.stringify(audit)).not.toContain(wrong);
    expect((await request(app).get('/api/auth/me').set('Cookie', session)).status).toBe(200);
  });

  it('un rol distinto de ADMIN recibe 403 sin autorización; sin Sesión, 401; una cuenta desactivada, 401', async () => {
    const app = newApp();
    const doctor = await sid(app, 'doctor');
    const denied = await grant(app, doctor, PASSWORDS.doctor);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    expect(cookieOf(denied, 'aid')).toBeUndefined();
    expect(await client().adminAuthorization.count()).toBe(0);
    expect((await request(app).post('/api/admin-authorization').send({ password: PASSWORDS.admin })).status).toBe(401);

    const admin = await sid(app, 'admin');
    await client().user.update({ where: { id: ids.admin }, data: { active: false } });
    try {
      expect((await grant(app, admin, PASSWORDS.admin)).status).toBe(401);
    } finally {
      await client().user.update({ where: { id: ids.admin }, data: { active: true } });
    }
    expect((await login(app, 'inactive')).status).toBe(401);
  });

  it('cookie aid alterada o sin firma y autorización de otra Sesión no sirven', async () => {
    const app = newApp();
    const s1 = await sid(app, 'admin');
    const aid = pair(cookieOf(await grant(app, s1, PASSWORDS.admin), 'aid') as string);
    const tampered = aid.slice(0, -2) + (aid.endsWith('A') ? 'B' : 'A') + aid.slice(-1);
    expect((await docs(app, s1, tampered)).status).toBe(403);
    expect((await docs(app, s1, `aid=${unsigned(aid)}`)).status).toBe(403);
    expect((await request(app).get('/api/admin-authorization').set('Cookie', `${s1}; ${tampered}`)).body).toEqual({ active: false, expiresAt: null });

    const s2 = await sid(app, 'admin');
    expect((await docs(app, s2, aid)).status).toBe(403);
    expect((await docs(app, s2, signCookie('aid', unsigned(aid)))).status).toBe(403);
    expect((await docs(app, s1, signCookie('aid', unsigned(aid)))).status).toBe(200);
  });

  it('vence exactamente a los 10 minutos sin cerrar la Sesión', async () => {
    const app = newApp();
    const session = await sid(app, 'admin');
    const aid = pair(cookieOf(await grant(app, session, PASSWORDS.admin), 'aid') as string);
    const granted = clock;
    clock = granted + 10 * MIN - 1;
    expect((await docs(app, session, aid)).status).toBe(200);
    clock = granted + 10 * MIN;
    const expired = await docs(app, session, aid);
    expect(expired.status).toBe(403);
    expect(expired.body.code).toBe('AUTORIZACION_ADMIN_REQUERIDA');
    expect((await request(app).get('/api/auth/me').set('Cookie', session)).status).toBe(200);
  });

  it('DELETE revoca; logout y cambio de contraseña también la invalidan', async () => {
    const app = newApp();
    const session = await sid(app, 'admin');
    const aid = pair(cookieOf(await grant(app, session, PASSWORDS.admin), 'aid') as string);
    const revoked = await request(app).delete('/api/admin-authorization').set('Cookie', `${session}; ${aid}`);
    expect(revoked.status).toBe(204);
    expect(cookieOf(revoked, 'aid')).toMatch(/^aid=;/);
    expect((await docs(app, session, aid)).status).toBe(403);

    // Logout: la autorización cae con la Sesión.
    const aid2 = pair(cookieOf(await grant(app, session, PASSWORDS.admin), 'aid') as string);
    expect((await request(app).post('/api/auth/logout').set('Cookie', session)).status).toBe(204);
    expect(await client().adminAuthorization.count()).toBe(0);
    const again = await sid(app, 'admin');
    expect((await docs(app, again, aid2)).status).toBe(403);

    // Cambio de contraseña: se revoca aunque la Sesión siga.
    const aid3 = pair(cookieOf(await grant(app, again, PASSWORDS.admin), 'aid') as string);
    const next = pw();
    expect((await request(app).post('/api/auth/change-password').set('Cookie', again).send({ currentPassword: PASSWORDS.admin, newPassword: next })).status).toBe(200);
    PASSWORDS.admin = next;
    expect((await docs(app, again, aid3)).status).toBe(403);
    expect((await request(app).get('/api/auth/me').set('Cookie', again)).status).toBe(200);
  });

  it('cinco contraseñas incorrectas bloquean con 429 incluso con la correcta; los intentos bloqueados no prolongan el bloqueo', async () => {
    const app = newApp();
    const session = await sid(app, 'admin');
    for (let i = 0; i < 5; i++) expect((await grant(app, session, pw())).status).toBe(401);
    const fifth = clock;
    for (const offset of [0, 5 * MIN, 14 * MIN, 15 * MIN - 1]) {
      clock = fifth + offset;
      const blocked = await grant(app, session, PASSWORDS.admin);
      expect(blocked.status).toBe(429);
      expect(cookieOf(blocked, 'aid')).toBeUndefined();
    }
    expect((await login(app, 'doctor')).status).toBe(200); // contador de login independiente
    clock = fifth + 15 * MIN;
    expect((await grant(app, session, PASSWORDS.admin)).status).toBe(201);
  });

  it('un otorgamiento correcto reinicia el contador de fallos', async () => {
    const app = newApp();
    const session = await sid(app, 'admin');
    for (let i = 0; i < 4; i++) expect((await grant(app, session, pw())).status).toBe(401);
    expect((await grant(app, session, PASSWORDS.admin)).status).toBe(201);
    for (let i = 0; i < 4; i++) expect((await grant(app, session, pw())).status).toBe(401);
    expect((await grant(app, session, PASSWORDS.admin)).status).toBe(201);
  });
});
