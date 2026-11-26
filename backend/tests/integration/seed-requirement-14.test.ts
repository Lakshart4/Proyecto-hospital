// Verificación formal del Requisito 14 que complementa seed.test.ts (tarea 2.4).
// Cubre lo que seed.test.ts no comprueba: integridad referencial de toda la base (14.7),
// datos ficticios (14.3), contraseñas generadas fuera de los archivos del proyecto (1.7, 14.5)
// y el comando `npm run seed` real ante errores (14.9): código de salida, causa y ausencia de contraseñas.
// Usa bases SQLite y carpetas de documentos temporales; nunca toca prisma/dev.db ni storage/documents.

import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runSeed, type SeedResult } from '../../prisma/seed/run-seed';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

const backendRoot = resolve(__dirname, '..', '..');
const repoRoot = resolve(backendRoot, '..');
const tsxCli = join(backendRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const ROUNDS = 4;
const randomValue = () => randomBytes(12).toString('base64url');

function listFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectStrings(item, out));
  else if (value && typeof value === 'object' && !(value instanceof Date)) Object.values(value).forEach((item) => collectStrings(item, out));
  return out;
}

describe('Requisito 14: base sembrada', () => {
  let db: TempDatabase | undefined;
  let client: PrismaClient;
  let documentsDir = '';
  let result: SeedResult;

  beforeAll(async () => {
    db = createTempDatabase('hm-req14-');
    client = db.client;
    documentsDir = mkdtempSync(join(tmpdir(), 'hm-req14-docs-'));
    result = await runSeed({ client, documentsDir, bcryptRounds: ROUNDS });
  }, 120_000);

  afterAll(async () => {
    await db?.cleanup();
    if (documentsDir) rmSync(documentsDir, { recursive: true, force: true });
  });

  it('14.7: las claves foráneas están activas y ningún registro referencia una entidad inexistente', async () => {
    const [pragma] = await client.$queryRaw<{ foreign_keys: number | bigint }[]>`PRAGMA foreign_keys`;
    expect(Number(pragma?.foreign_keys)).toBe(1);
    const violations = await client.$queryRaw<unknown[]>`PRAGMA foreign_key_check`;
    expect(violations).toEqual([]);
  });

  it('14.3: todos los datos son ficticios (correos de dominio reservado, teléfonos 555 e IDs internos de demostración)', async () => {
    const tables = await Promise.all([
      client.department.findMany(), client.user.findMany(), client.scheduleSlot.findMany(), client.scheduleBreak.findMany(),
      client.employeeDocument.findMany(), client.patient.findMany(), client.patientMovement.findMany(), client.treatment.findMany(),
      client.room.findMany(), client.roomAssignment.findMany(), client.supplier.findMany(), client.product.findMany(),
      client.medicationInfo.findMany(), client.supplierDelivery.findMany(), client.inventoryMovement.findMany(),
      client.equipment.findMany(), client.maintenanceRecord.findMany(), client.event.findMany(), client.nonWorkingDay.findMany(),
    ]);
    const strings = collectStrings(tables);
    const emails = strings.flatMap((text) => [...text.matchAll(/[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g)]);
    expect(emails.length).toBeGreaterThanOrEqual(15);
    for (const match of emails) {
      const domain = (match[1] ?? '').toLowerCase();
      expect(domain === 'example.com' || domain.endsWith('.example.com'), `dominio no reservado: ${domain}`).toBe(true);
    }

    const users = await client.user.findMany();
    const patients = await client.patient.findMany();
    for (const user of users) {
      expect(user.internalId).toMatch(/^(ADM|EMP)-\d{3}$/);
      expect(user.phone).toMatch(/^555-\d{4}$/);
    }
    for (const patient of patients) {
      expect(patient.internalId).toMatch(/^PAC-\d{3}$/);
      if (patient.phone !== null) expect(patient.phone).toMatch(/^555-\d{4}$/);
    }
    for (const supplier of await client.supplier.findMany()) {
      expect(supplier.name).toMatch(/\(fictici[oa]\)$/);
      expect(supplier.contact).toMatch(/555-\d{4}/);
    }
  });

  it('1.7 y 14.5: las contraseñas generadas no quedan escritas en ningún archivo del proyecto ni en los PDF', () => {
    const passwords = result.credentials.map((c) => c.password).filter((p): p is string => p !== null);
    expect(passwords).toHaveLength(11);

    const gitFiles = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repoRoot, encoding: 'utf8' })
      .stdout.split('\0')
      .filter((path) => path && !path.endsWith('.db') && !path.endsWith('package-lock.json'));
    const contents = [
      ...gitFiles.map((path) => readFileSync(join(repoRoot, path)).toString('latin1')),
      ...listFiles(documentsDir).map((path) => readFileSync(path).toString('latin1')),
    ];
    expect(contents.length).toBeGreaterThan(40);
    for (const password of passwords) {
      expect(contents.some((content) => content.includes(password))).toBe(false);
    }
  });
});

describe('Requisito 14.9: el comando `npm run seed` ante errores', () => {
  let db: TempDatabase | undefined;

  beforeAll(() => {
    db = createTempDatabase('hm-req14-cli-');
  }, 120_000);

  afterAll(async () => {
    await db?.cleanup();
  });

  /** Ejecuta prisma/seed.ts con tsx como lo hace `npm run seed`, contra la base temporal. */
  function runSeedCommand(extraEnv: Record<string, string>) {
    const child = spawnSync(process.execPath, [tsxCli, 'prisma/seed.ts'], {
      cwd: backendRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        DATABASE_URL: (db as TempDatabase).url,
        SESSION_SECRET: randomBytes(48).toString('hex'),
        CORS_ORIGIN: 'http://localhost:5173',
        PRISMA_HIDE_UPDATE_MESSAGE: '1',
        ...extraEnv,
      },
      timeout: 120_000,
    });
    return { status: child.status, output: `${child.stdout}\n${child.stderr}` };
  }

  it('con contraseñas demo repetidas termina con código 1, indica la causa sin mostrar la contraseña y no escribe nada', async () => {
    const repeated = randomValue();
    const { status, output } = runSeedCommand({ DEMO_NURSE_1_PASSWORD: repeated, DEMO_NURSE_2_PASSWORD: repeated });

    expect(status).toBe(1);
    expect(output).toContain('La semilla falló y no se guardó ningún cambio');
    expect(output).toMatch(/Causa: .*DEMO_NURSE_1_PASSWORD = DEMO_NURSE_2_PASSWORD/);
    expect(output).not.toContain(repeated);
    expect(output).not.toContain('CREDENCIALES DEMO');
    expect(await (db as TempDatabase).client.user.count()).toBe(0);
  }, 120_000);

  it('con una contraseña demo inválida termina con código 1 nombrando la variable, sin mostrar su valor', async () => {
    const tooShort = randomBytes(2).toString('hex');
    const { status, output } = runSeedCommand({ DEMO_ADMIN_PASSWORD: tooShort });

    expect(status).toBe(1);
    expect(output).toContain('DEMO_ADMIN_PASSWORD');
    expect(output).not.toContain(tooShort);
    expect(await (db as TempDatabase).client.user.count()).toBe(0);
  }, 120_000);

  it('sin SESSION_SECRET termina con código 1 nombrando la variable, como el Backend', async () => {
    const { status, output } = runSeedCommand({ SESSION_SECRET: '' });

    expect(status).toBe(1);
    expect(output).toContain('SESSION_SECRET: Variable obligatoria no definida.');
    expect(await (db as TempDatabase).client.user.count()).toBe(0);
  }, 120_000);
});
