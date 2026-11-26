// Base SQLite temporal para pruebas de integración.
// Crea una carpeta temporal, aplica las migraciones con `prisma migrate deploy` y
// devuelve un cliente conectado a esa base. `cleanup` cierra el cliente y borra la carpeta.
// Nunca usa prisma/dev.db.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { createPrismaClient } from '../../src/lib/prisma';

const backendRoot = join(__dirname, '..', '..');
const prismaCli = join(backendRoot, 'node_modules', 'prisma', 'build', 'index.js');

export interface TempDatabase {
  url: string;
  client: PrismaClient;
  cleanup: () => Promise<void>;
}

export function createTempDatabase(prefix = 'hm-test-'): TempDatabase {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const url = `file:${join(dir, 'test.db').replace(/\\/g, '/')}`;
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: url, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    stdio: 'pipe',
  });
  const client = createPrismaClient(url);
  return {
    url,
    client,
    cleanup: async () => {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
