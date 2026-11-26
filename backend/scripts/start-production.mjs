// Prepara una instancia Render Free (almacenamiento efímero) y arranca la aplicación web única.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(backendDir);
process.env.NODE_ENV = 'production';

// El esquema relacional está listo antes de consultar si la base está vacía.
const migrateCli = require.resolve('prisma/build/index.js');
const migration = spawnSync(process.execPath, [migrateCli, 'migrate', 'deploy', '--schema', join(backendDir, 'prisma', 'schema.prisma')], {
  cwd: backendDir,
  stdio: 'inherit',
  env: process.env,
});
if (migration.error) throw migration.error;
if (migration.status !== 0) process.exit(migration.status ?? 1);

const { PrismaClient, Prisma } = require('@prisma/client');
const db = new PrismaClient({ errorFormat: 'minimal' });
let databaseIsEmpty = true;
try {
  const counts = await Promise.all(Prisma.dmmf.datamodel.models.map(async (model) => {
    // Una migración puede crear la configuración inicial sin que haya datos hospitalarios todavía.
    if (model.name === 'InstitutionConfig') return 0;
    const delegateName = `${model.name[0].toLowerCase()}${model.name.slice(1)}`;
    return db[delegateName].count();
  }));
  databaseIsEmpty = counts.every((count) => count === 0);
} finally {
  await db.$disconnect();
}

// La semilla existente es transaccional e idempotente; solo se ejecuta si no hay datos.
if (databaseIsEmpty) {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const seed = spawnSync(npmCommand, ['run', 'seed'], { cwd: backendDir, stdio: 'inherit', env: process.env });
  if (seed.error) throw seed.error;
  if (seed.status !== 0) process.exit(seed.status ?? 1);
}

// `main` carga la configuración, usa process.env.PORT y habilita cookies Secure en producción.
const { main } = await import('../dist/server.js');
await main();
