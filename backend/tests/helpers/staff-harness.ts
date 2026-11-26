// Entorno de pruebas de integración de Personal (tareas 6.1 y 6.3): aplicación real con supertest, SQLite
// temporal con las migraciones reales y carpetas temporales para fotos y documentos. Las contraseñas se
// generan en cada ejecución. Nunca toca backend/uploads ni backend/storage.

import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../../src/app';
import { BCRYPT_TEST_COST, hashPassword } from '../../src/lib/password';
import { createTempDatabase, type TempDatabase } from './temp-database';

export const SECRET = randomBytes(32).toString('hex');
export const newPassword = () => randomBytes(12).toString('base64url');

export interface TestUser {
  id: number;
  email: string;
  password: string;
  internalId: string;
}

export type UserKey = 'admin' | 'admin2' | 'doctor1' | 'doctor2' | 'nurse' | 'cleaner' | 'pending';

export interface StaffHarness {
  app: Express;
  client: PrismaClient;
  photosDir: string;
  documentsDir: string;
  users: Record<UserKey, TestUser>;
  departments: { urgencias: number; cardiologia: number };
  /** Inicia sesión y devuelve el par `sid=...` listo para la cabecera Cookie. */
  sid: (key: UserKey) => Promise<string>;
  /** Crea una cuenta de Empleado directamente en la base (sin pasar por la API). */
  createEmployee: (data: { internalId: string; email: string; role: string; name?: string; departmentId?: number; shift?: string; mustChangePassword?: boolean; photoUrl?: string | null }) => Promise<TestUser>;
  /** Hace fallar toda escritura en la bitácora hasta llamar a `restoreAudit`. */
  breakAudit: () => Promise<void>;
  restoreAudit: () => Promise<void>;
  cleanup: () => Promise<void>;
}

export async function createStaffHarness(options: { generateInitialPassword?: () => string } = {}): Promise<StaffHarness> {
  const db: TempDatabase = createTempDatabase('hm-staff-');
  const client = db.client;
  const base = mkdtempSync(join(tmpdir(), 'hm-staff-files-'));
  const photosDir = join(base, 'photos');
  const documentsDir = join(base, 'documents');
  mkdirSync(photosDir, { recursive: true });
  mkdirSync(documentsDir, { recursive: true });

  const urgencias = await client.department.create({ data: { name: 'Urgencias' } });
  const cardiologia = await client.department.create({ data: { name: 'Cardiología' } });

  const app = createApp({
    corsOrigin: 'http://localhost:5173',
    sessionSecret: SECRET,
    db: client,
    bcryptCost: BCRYPT_TEST_COST,
    logError: () => undefined,
    photosDir,
    documentsDir,
    ...(options.generateInitialPassword ? { generateInitialPassword: options.generateInitialPassword } : {}),
  });

  const users = {} as Record<UserKey, TestUser>;
  let counter = 1;

  const createEmployee: StaffHarness['createEmployee'] = async (data) => {
    const password = newPassword();
    const user = await client.user.create({
      data: {
        internalId: data.internalId,
        email: data.email,
        passwordHash: await hashPassword(password, BCRYPT_TEST_COST),
        role: data.role,
        mustChangePassword: data.mustChangePassword ?? false,
        name: data.name ?? `Usuario ${data.internalId}`,
        position: 'Cargo',
        specialty: 'General',
        departmentId: data.departmentId ?? urgencias.id,
        yearsExperience: 3,
        shift: data.shift ?? 'matutino',
        phone: '5551234567',
        photoUrl: data.photoUrl ?? null,
      },
    });
    return { id: user.id, email: data.email, password, internalId: data.internalId };
  };

  const seed: [UserKey, string, boolean?, string?][] = [
    ['admin', 'ADMIN'],
    ['admin2', 'ADMIN'],
    ['doctor1', 'DOCTOR', false, 'Álvaro Núñez Peña'],
    ['doctor2', 'DOCTOR'],
    ['nurse', 'NURSE'],
    ['cleaner', 'CLEANING'],
    ['pending', 'DOCTOR', true],
  ];
  for (const [key, role, mustChange, name] of seed) {
    const n = counter++;
    users[key] = await createEmployee({
      internalId: `T-${n}`,
      email: `${key}@example.com`,
      role,
      mustChangePassword: mustChange ?? false,
      ...(name ? { name } : {}),
      ...(key === 'doctor2' ? { departmentId: cardiologia.id, shift: 'vespertino' } : {}),
    });
  }

  const sid = async (key: UserKey): Promise<string> => {
    const user = users[key];
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password: user.password });
    if (res.status !== 200) throw new Error(`No se pudo iniciar sesión como ${key}: ${res.status}`);
    const header = res.headers['set-cookie'] as unknown;
    const cookies = Array.isArray(header) ? (header as string[]) : [String(header)];
    const cookie = cookies.find((c) => c.startsWith('sid='));
    if (!cookie) throw new Error('Sin cookie de sesión');
    return cookie.split(';')[0] as string;
  };

  return {
    app,
    client,
    photosDir,
    documentsDir,
    users,
    departments: { urgencias: urgencias.id, cardiologia: cardiologia.id },
    sid,
    createEmployee,
    breakAudit: async () => {
      await client.$executeRawUnsafe(`CREATE TRIGGER IF NOT EXISTS fail_audit BEFORE INSERT ON "AuditLog" BEGIN SELECT RAISE(ABORT, 'auditoria no disponible'); END;`);
    },
    restoreAudit: async () => {
      await client.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_audit;');
    },
    cleanup: async () => {
      await db.cleanup();
      rmSync(base, { recursive: true, force: true });
    },
  };
}

/** Escribe un archivo de documento ficticio dentro de la carpeta temporal de documentos. */
export function writeDocumentFile(documentsDir: string, relativePath: string): string {
  const path = join(documentsDir, ...relativePath.split('/'));
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, '%PDF-1.4 prueba');
  return path;
}

/** Imagen PNG falsa pero con la firma correcta, de `size` bytes. */
export function pngBytes(size = 64): Buffer {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, randomBytes(Math.max(0, size - signature.length))]);
}

/** Imagen JPEG falsa pero con la firma correcta, de `size` bytes. */
export function jpegBytes(size = 64): Buffer {
  const signature = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  return Buffer.concat([signature, randomBytes(Math.max(0, size - signature.length))]);
}
