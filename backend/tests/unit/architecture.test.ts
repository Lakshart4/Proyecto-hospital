// Comprueba la separación de capas del Backend (Req. 16.2):
// solo src/lib/prisma.ts y src/repositories/ importan @prisma/client, y solo
// src/repositories/ importa el cliente compartido de src/lib/prisma.ts.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = join(__dirname, '..', '..', 'src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|mts|cts)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(srcRoot).map((path) => ({
  path: relative(srcRoot, path).split(sep).join('/'),
  text: readFileSync(path, 'utf8'),
}));

const importsPrismaClient = (text: string) => /from\s+['"]@prisma\/client['"]|require\(\s*['"]@prisma\/client['"]\s*\)/.test(text);
const importsSharedClient = (text: string) => /from\s+['"](\.\.?\/)+(lib\/)?prisma['"]/.test(text);

describe('Arquitectura por capas', () => {
  it('solo lib/prisma.ts y repositories/ importan @prisma/client', () => {
    const offenders = files
      .filter((f) => importsPrismaClient(f.text))
      .map((f) => f.path)
      .filter((path) => path !== 'lib/prisma.ts' && !path.startsWith('repositories/'));
    expect(offenders).toEqual([]);
  });

  it('solo repositories/ importa el cliente compartido de lib/prisma.ts', () => {
    const offenders = files
      .filter((f) => f.path !== 'lib/prisma.ts' && importsSharedClient(f.text))
      .map((f) => f.path)
      .filter((path) => !path.startsWith('repositories/'));
    expect(offenders).toEqual([]);
  });

  it('las rutas y los controladores no importan Prisma de ninguna forma', () => {
    const offenders = files
      .filter((f) => f.path.startsWith('routes/') || f.path.startsWith('controllers/'))
      .filter((f) => importsPrismaClient(f.text) || importsSharedClient(f.text) || f.text.includes('repositories/'))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('el repositorio de transacciones importa el cliente compartido (la comprobación detecta imports reales)', () => {
    const transaction = files.find((f) => f.path === 'repositories/transaction.ts');
    expect(transaction && importsSharedClient(transaction.text)).toBe(true);
  });
});
