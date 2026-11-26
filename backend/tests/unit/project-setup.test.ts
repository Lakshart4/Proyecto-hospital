import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

describe('Configuración del proyecto backend', () => {
  it('compila TypeScript en modo strict (Req. 16.4)', () => {
    const tsconfig = JSON.parse(readFileSync(join(root, 'tsconfig.json'), 'utf8')) as {
      compilerOptions: { strict?: boolean };
    };
    expect(tsconfig.compilerOptions.strict).toBe(true);
  });

  it('define los scripts dev, build, test, seed y migrate', () => {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const name of ['dev', 'build', 'test', 'seed', 'migrate']) {
      expect(pkg.scripts[name]).toBeTypeOf('string');
    }
    expect(pkg.scripts.test).toBe('vitest --run');
  });
});
