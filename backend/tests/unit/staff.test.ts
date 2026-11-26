// Pruebas unitarias de Personal (tarea 6.1, y los utilitarios de archivos de 6.3): filtros, objetos públicos,
// nombres de foto, contraseña inicial, esquemas zod y almacenamiento en disco con carpetas temporales.

import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyFilters } from '../../src/domain/filters';
import {
  DEFAULT_PHOTO_URL,
  effectivePhotoUrl,
  isValidPhotoFilename,
  photoFilenameOf,
  photoUrlFor,
  staffCriteria,
  toStaffListItem,
  toStaffProfile,
  type StaffDetailRow,
  type StaffListRow,
} from '../../src/domain/staff';
import { createDocumentFiles } from '../../src/lib/document-files';
import { DIGITS, generateInitialPassword, INITIAL_PASSWORD_LENGTH, LOWERCASE, UPPERCASE } from '../../src/lib/initial-password';
import { createPhotoStorage } from '../../src/lib/photo-storage';
import { patchMeBodySchema, scheduleBodySchema, staffBodySchema, staffListQuerySchema } from '../../src/schemas/staff';
import { spanishErrorMap } from '../../src/schemas/common';

const UUID = '3f2b8c1e-9d4a-4b6f-8a21-5c7e0d9b1a42';

function row(over: Partial<StaffListRow> & { id: number }): StaffListRow {
  return {
    internalId: `E-${over.id}`,
    email: `e${over.id}@example.com`,
    role: 'DOCTOR',
    active: true,
    name: `Empleado ${over.id}`,
    photoUrl: null,
    position: 'Cargo',
    description: '',
    specialty: 'General',
    departmentId: 1,
    department: { id: 1, name: 'Urgencias' },
    yearsExperience: 1,
    shift: 'matutino',
    phone: '555',
    birthDate: null,
    ...over,
  };
}

describe('Contraseña inicial', () => {
  it('tiene 12 caracteres sin ambiguos y al menos una mayúscula, una minúscula y un dígito', () => {
    for (let i = 0; i < 500; i++) {
      const password = generateInitialPassword();
      expect(password).toHaveLength(INITIAL_PASSWORD_LENGTH);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/\d/);
      expect(password).not.toMatch(/[Il1Oo0]/);
      expect([...password].every((c) => (UPPERCASE + LOWERCASE + DIGITS).includes(c))).toBe(true);
    }
  });

  it('usa un alfabeto sin caracteres ambiguos', () => {
    expect(UPPERCASE + LOWERCASE + DIGITS).not.toMatch(/[Il1Oo0]/);
  });
});

describe('Nombres y URL de fotos', () => {
  it('acepta solo un UUID en minúsculas con extensión jpg o png', () => {
    expect(isValidPhotoFilename(`${UUID}.jpg`)).toBe(true);
    expect(isValidPhotoFilename(`${UUID}.png`)).toBe(true);
  });

  it.each([
    `${UUID}.gif`,
    `${UUID}.svg`,
    `${UUID}.JPG`,
    `${UUID}.jpg.exe`,
    `${UUID.toUpperCase()}.png`,
    `../${UUID}.png`,
    `..\\${UUID}.png`,
    `${UUID}/../x.png`,
    '../../package.json',
    '..%2F..%2Fpackage.json',
    `${UUID}.png\0.txt`,
    'foto.png',
    '',
    `${UUID}`,
    ` ${UUID}.png`,
    `${UUID}.png `,
  ])('rechaza %j', (name) => {
    expect(isValidPhotoFilename(name)).toBe(false);
  });

  it('rechaza valores que no son texto', () => {
    for (const value of [undefined, null, 5, ['a.png'], {}]) expect(isValidPhotoFilename(value)).toBe(false);
  });

  it('photoFilenameOf solo reconoce las fotos cargadas por el sistema', () => {
    expect(photoFilenameOf(photoUrlFor(`${UUID}.png`))).toBe(`${UUID}.png`);
    expect(photoFilenameOf(null)).toBeNull();
    expect(photoFilenameOf(DEFAULT_PHOTO_URL)).toBeNull();
    expect(photoFilenameOf('https://ejemplo.com/foto.png')).toBeNull();
    expect(photoFilenameOf('/api/uploads/photos/../../x.png')).toBeNull();
  });

  it('devuelve la foto por defecto cuando no hay foto y la guardada cuando existe', () => {
    expect(effectivePhotoUrl(null)).toBe('/avatars/default.svg');
    expect(effectivePhotoUrl(photoUrlFor(`${UUID}.png`))).toBe(`/api/uploads/photos/${UUID}.png`);
  });
});

describe('Filtros y objetos públicos', () => {
  const rows = [
    row({ id: 1, name: 'Álvaro Núñez', role: 'DOCTOR', departmentId: 1, shift: 'matutino', internalId: 'EMP-001' }),
    row({ id: 2, name: 'Beatriz Ríos', role: 'NURSE', departmentId: 2, shift: 'vespertino', internalId: 'EMP-002' }),
    row({ id: 3, name: 'Carlos Ñandú', role: 'DOCTOR', departmentId: 2, shift: 'vespertino', internalId: 'EMP-003' }),
  ];
  const ids = (filters: Parameters<typeof staffCriteria>[0]) => applyFilters<StaffListRow>(rows, staffCriteria(filters)).map((r) => r.id);

  it('sin filtros devuelve todos y combina los filtros con AND', () => {
    expect(ids({})).toEqual([1, 2, 3]);
    expect(ids({ role: 'DOCTOR' })).toEqual([1, 3]);
    expect(ids({ role: 'DOCTOR', departmentId: 2 })).toEqual([3]);
    expect(ids({ role: 'DOCTOR', departmentId: 2, shift: 'matutino' })).toEqual([]);
  });

  it('busca por nombre o ID interno sin distinguir mayúsculas ni acentos de mayúscula', () => {
    expect(ids({ search: 'ÁLVARO' })).toEqual([1]);
    expect(ids({ search: 'ñandú' })).toEqual([3]);
    expect(ids({ search: 'emp-002' })).toEqual([2]);
    expect(ids({ search: '  ' })).toEqual([1, 2, 3]);
    expect(ids({ search: 'zzz' })).toEqual([]);
  });

  it('el objeto público no incluye datos de acceso y usa la foto por defecto', () => {
    const item = toStaffListItem(rows[0] as StaffListRow);
    expect(item.photoUrl).toBe(DEFAULT_PHOTO_URL);
    expect(Object.keys(item)).not.toEqual(expect.arrayContaining(['passwordHash', 'mustChangePassword']));
    expect(JSON.stringify(item)).not.toMatch(/password/i);
  });

  it('el Perfil incluye el horario ordenado por día', () => {
    const detail: StaffDetailRow = {
      ...(rows[0] as StaffListRow),
      birthDate: new Date('1990-05-17T00:00:00.000Z'),
      scheduleSlots: [
        { dayOfWeek: 3, startTime: '08:00', endTime: '16:00', mealStart: null, mealEnd: null, breaks: [] },
        { dayOfWeek: 1, startTime: '07:00', endTime: '15:00', mealStart: '11:00', mealEnd: '11:30', breaks: [{ startTime: '09:00', endTime: '09:15' }] },
      ],
    };
    const profile = toStaffProfile(detail);
    expect(profile.birthDate).toBe('1990-05-17');
    expect(profile.schedule.map((d) => d.dayOfWeek)).toEqual([1, 3]);
    expect(profile.schedule[0]?.breaks).toEqual([{ startTime: '09:00', endTime: '09:15' }]);
  });
});

describe('Esquemas', () => {
  const valid = {
    internalId: 'EMP-100',
    email: 'nuevo@example.com',
    role: 'NURSE',
    name: 'Nuevo Empleado',
    position: 'Enfermero',
    description: '',
    specialty: 'General',
    departmentId: 1,
    yearsExperience: 5,
    shift: 'matutino',
    phone: '555-0100',
  };
  const parse = (body: unknown) => staffBodySchema.safeParse(body, { error: spanishErrorMap });
  const fieldsOf = (body: unknown) => {
    const result = parse(body);
    return result.success ? [] : result.error.issues.map((i) => i.path.join('.'));
  };

  it('acepta un cuerpo válido, recorta espacios y descarta claves desconocidas', () => {
    const result = parse({ ...valid, name: '  Nuevo  ', passwordHash: 'x', active: false, mustChangePassword: false });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('Nuevo');
      expect(result.data).not.toHaveProperty('passwordHash');
      expect(result.data).not.toHaveProperty('active');
      expect(result.data).not.toHaveProperty('mustChangePassword');
    }
  });

  it('rechaza campos vacíos, solo espacios, rangos, formatos y roles no permitidos', () => {
    expect(fieldsOf({ ...valid, name: '   ' })).toEqual(['name']);
    expect(fieldsOf({ ...valid, internalId: 'x'.repeat(31) })).toEqual(['internalId']);
    expect(fieldsOf({ ...valid, email: 'sin-arroba' })).toEqual(['email']);
    expect(fieldsOf({ ...valid, yearsExperience: 61 })).toEqual(['yearsExperience']);
    expect(fieldsOf({ ...valid, yearsExperience: -1 })).toEqual(['yearsExperience']);
    expect(fieldsOf({ ...valid, yearsExperience: 2.5 })).toEqual(['yearsExperience']);
    expect(fieldsOf({ ...valid, shift: 'nocturno' })).toEqual(['shift']);
    expect(fieldsOf({ ...valid, description: 'x'.repeat(501) })).toEqual(['description']);
    expect(fieldsOf({ ...valid, phone: 'x'.repeat(31) })).toEqual(['phone']);
    expect(fieldsOf({ ...valid, role: 'ADMIN' })).toEqual(['role']);
    expect(fieldsOf({ ...valid, role: ['DOCTOR', 'NURSE'] })).toEqual(['role']);
    expect(fieldsOf({ ...valid, birthDate: '1990-02-30' })).toEqual(['birthDate']);
    expect(fieldsOf({})).toEqual(expect.arrayContaining(['internalId', 'email', 'role', 'name', 'position', 'specialty', 'departmentId', 'yearsExperience', 'shift', 'phone']));
  });

  it('la descripción es opcional y la fecha de nacimiento admite null', () => {
    const { description: _description, ...withoutDescription } = valid;
    const result = parse({ ...withoutDescription, birthDate: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.description).toBe('');
  });

  it('la query de la lista trata los valores vacíos como no indicados y rechaza roles inválidos', () => {
    expect(staffListQuerySchema.safeParse({ role: '', shift: ' ', search: '' }).success).toBe(true);
    expect(staffListQuerySchema.safeParse({ role: 'ADMIN' }).success).toBe(false);
    expect(staffListQuerySchema.safeParse({ departmentId: 'abc' }).success).toBe(false);
    expect(staffListQuerySchema.safeParse({ role: ['DOCTOR', 'NURSE'] }).success).toBe(false);
    const ok = staffListQuerySchema.safeParse({ role: 'DOCTOR', departmentId: '3', shift: 'matutino', search: 'a' });
    expect(ok.success && ok.data).toEqual({ role: 'DOCTOR', departmentId: 3, shift: 'matutino', search: 'a' });
  });

  it('PATCH /staff/me solo declara phone y photoUrl', () => {
    const result = patchMeBodySchema.safeParse({ phone: ' 555 ', photoUrl: null, position: 'x' });
    expect(result.success && result.data).toEqual({ phone: '555', photoUrl: null });
    expect(patchMeBodySchema.safeParse({ phone: '   ' }).success).toBe(false);
  });

  it('el horario exige una lista de días con día de la semana de 0 a 6', () => {
    expect(scheduleBodySchema.safeParse({ days: [] }).success).toBe(true);
    expect(scheduleBodySchema.safeParse({ days: [{ dayOfWeek: 7, startTime: '08:00', endTime: '16:00' }] }).success).toBe(false);
    expect(scheduleBodySchema.safeParse({ days: [{ dayOfWeek: 1, startTime: 800, endTime: '16:00' }] }).success).toBe(false);
    expect(scheduleBodySchema.safeParse({ days: Array.from({ length: 8 }, (_, i) => ({ dayOfWeek: i % 7, startTime: '08:00', endTime: '16:00' })) }).success).toBe(false);
    expect(scheduleBodySchema.safeParse({ nada: 1 }).success).toBe(false);
    const ok = scheduleBodySchema.safeParse({ days: [{ dayOfWeek: 1, startTime: '08:00', endTime: '16:00' }] });
    expect(ok.success && ok.data.days[0]?.breaks).toEqual([]);
  });
});

describe('Almacenamiento de fotos', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hm-photos-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('guarda con nombre UUID y extensión, lee y borra', async () => {
    const storage = createPhotoStorage(join(dir, 'nueva', 'photos'));
    const name = await storage.save(Buffer.from([1, 2, 3]), 'png');
    expect(isValidPhotoFilename(name)).toBe(true);
    expect(name.endsWith('.png')).toBe(true);
    expect(Buffer.from((await storage.read(name)) as Uint8Array)).toEqual(Buffer.from([1, 2, 3]));
    await storage.remove(name);
    expect(await storage.read(name)).toBeNull();
    await storage.remove(name);
  });

  it('nunca lee ni borra fuera de la carpeta', async () => {
    const photos = join(dir, 'photos');
    mkdirSync(photos);
    writeFileSync(join(dir, 'secreto.png'), 'privado');
    writeFileSync(join(dir, 'secreto.txt'), 'privado');
    const storage = createPhotoStorage(photos);
    for (const name of ['../secreto.png', '..\\secreto.png', '../secreto.txt', join(dir, 'secreto.png'), `${UUID}/../../secreto.png`]) {
      expect(await storage.read(name)).toBeNull();
      await storage.remove(name);
    }
    expect(existsSync(join(dir, 'secreto.png'))).toBe(true);
    expect(existsSync(join(dir, 'secreto.txt'))).toBe(true);
    expect(readdirSync(photos)).toEqual([]);
  });

  it('un nombre válido que no existe devuelve null', async () => {
    const storage = createPhotoStorage(dir);
    expect(await storage.read(`${UUID}.jpg`)).toBeNull();
  });
});

describe('Limpieza de archivos de documentos', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'hm-docs-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('borra los archivos indicados y deja el resto', async () => {
    const docs = join(dir, 'documents');
    mkdirSync(join(docs, 'seed'), { recursive: true });
    writeFileSync(join(docs, 'seed', 'a.pdf'), 'a');
    writeFileSync(join(docs, 'seed', 'b.pdf'), 'b');
    const files = createDocumentFiles(docs);
    expect(await files.removeAll(['seed/a.pdf', 'seed/inexistente.pdf'])).toBe(2);
    expect(existsSync(join(docs, 'seed', 'a.pdf'))).toBe(false);
    expect(existsSync(join(docs, 'seed', 'b.pdf'))).toBe(true);
  });

  it('ignora rutas que salen de la carpeta', async () => {
    const docs = join(dir, 'documents');
    mkdirSync(docs);
    writeFileSync(join(dir, 'fuera.pdf'), 'fuera');
    const files = createDocumentFiles(docs);
    const attempted = await files.removeAll(['../fuera.pdf', '..\\fuera.pdf', join(dir, 'fuera.pdf'), '', 'a/../../fuera.pdf', 'x\0.pdf']);
    expect(attempted).toBe(0);
    expect(existsSync(join(dir, 'fuera.pdf'))).toBe(true);
  });
});
