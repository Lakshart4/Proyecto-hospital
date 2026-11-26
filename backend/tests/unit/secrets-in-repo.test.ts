// Ausencia de contraseñas y secretos en los archivos versionables (Req. 1.7, 14.5, 16.5; tarea 2.4)
// y almacenamiento privado de los PDF (Req. 19.6).
// "Versionable" = lo que git incluiría: archivos rastreados o no ignorados (`git ls-files -co --exclude-standard`).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS } from '../../prisma/seed/data';
import { DEFAULT_DOCUMENTS_DIR } from '../../prisma/seed/run-seed';

const repoRoot = resolve(__dirname, '..', '..', '..');
const thisFile = relative(repoRoot, __filename).split(sep).join('/');

const git = (...args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

const versionable = git('ls-files', '--cached', '--others', '--exclude-standard', '-z')
  .split('\0')
  .filter(Boolean)
  .filter((path) => path.startsWith('backend/') || path.startsWith('frontend/') || path === 'README.md' || path === '.gitignore');

const TEXT_FILE = /\.(ts|tsx|mts|cts|js|mjs|cjs|json|md|prisma|sql|toml|html|css|example)$|(^|\/)\.gitignore$/;
const textFiles = versionable
  .filter((path) => TEXT_FILE.test(path) && !path.endsWith('package-lock.json') && path !== thisFile)
  .map((path) => ({ path, text: readFileSync(join(repoRoot, path), 'utf8') }));

/**
 * Devuelve las clases de secreto literal encontradas en una línea. Los patrones de valor capturan el
 * texto entre comillas; se ignoran los valores vacíos o solo con espacios (casos de "variable no definida")
 * y las plantillas con ${...} (valores generados al ejecutar).
 */
function findLiteralSecrets(line: string): string[] {
  const found: string[] = [];
  if (/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/.test(line)) found.push('hash bcrypt');
  const valuePatterns: [string, RegExp][] = [
    ['variable *_PASSWORD con valor literal', /\b[A-Z0-9_]*PASSWORD\s*[:=]\s*['"`]([^'"`]*)['"`]/g],
    ['campo de contraseña con valor literal', /\b(?:password|newPassword|currentPassword|plainPassword)\s*[:=]\s*['"`]([^'"`]*)['"`]/g],
    ['SESSION_SECRET con valor literal', /\bSESSION_SECRET\s*[:=]\s*['"`]([^'"`]*)['"`]/g],
  ];
  for (const [label, pattern] of valuePatterns) {
    for (const match of line.matchAll(pattern)) {
      const value = match[1] ?? '';
      if (value.trim() !== '' && !value.includes('${')) found.push(label);
    }
  }
  return found;
}

describe('Secretos fuera del repositorio', () => {
  it('el detector reconoce secretos literales y no confunde valores vacíos ni generados (control)', () => {
    const quote = "'";
    const sample = (key: string, value: string) => `${key}: ${quote}${value}${quote}`;
    expect(findLiteralSecrets(sample('DEMO_ADMIN_PASSWORD', 'abcd1234'))).toHaveLength(1);
    expect(findLiteralSecrets(sample('password', 'abcd1234'))).toHaveLength(1);
    expect(findLiteralSecrets(sample('SESSION_SECRET', 'abcd1234'))).toHaveLength(1);
    expect(findLiteralSecrets(`passwordHash: ${quote}$2b$10$${'a'.repeat(53)}${quote}`)).toContain('hash bcrypt');
    expect(findLiteralSecrets(sample('SESSION_SECRET', '   '))).toEqual([]);
    expect(findLiteralSecrets('DEMO_ADMIN_PASSWORD=')).toEqual([]);
  });

  it('ningún archivo .env real es versionable y git ignora .env, la base SQLite y los archivos cargados', () => {
    const envFiles = versionable.filter((path) => /(^|\/)\.env(\.|$)/.test(path));
    expect(envFiles.sort()).toEqual(['backend/.env.example', 'frontend/.env.example']);

    const mustBeIgnored = [
      'backend/.env',
      'frontend/.env',
      'backend/.env.local',
      'backend/prisma/dev.db',
      'backend/storage/documents/seed/EMP-001-contratacion.pdf',
      'backend/uploads/photos/foto.png',
    ];
    const ignored = git('check-ignore', '--no-index', ...mustBeIgnored).split(/\r?\n/).filter(Boolean);
    expect(ignored.sort()).toEqual([...mustBeIgnored].sort());
  });

  it('los .env.example no contienen secretos ni contraseñas', () => {
    for (const file of textFiles.filter((f) => f.path.endsWith('.env.example'))) {
      for (const line of file.text.split(/\r?\n/)) {
        const match = /^(SESSION_SECRET|SMTP_PASSWORD|DEMO_[A-Z0-9_]+_PASSWORD)=(.*)$/.exec(line.trim());
        if (match) expect(match[2], `${file.path}: ${match[1]} debe estar vacía`).toBe('');
      }
    }
    const example = textFiles.find((f) => f.path === 'backend/.env.example')?.text ?? '';
    for (const account of DEMO_ACCOUNTS) expect(example).toContain(`${account.variable}=`);
  });

  it('el código, la configuración y las pruebas no contienen contraseñas ni hashes escritos en texto plano', () => {
    const offenders: string[] = [];
    for (const file of textFiles) {
      file.text.split(/\r?\n/).forEach((line, index) => {
        for (const label of findLiteralSecrets(line)) offenders.push(`${file.path}:${index + 1} (${label})`);
      });
    }
    expect(offenders).toEqual([]);
    expect(textFiles.length).toBeGreaterThan(20);
  });

  it('los PDF de documentos se guardan en backend/storage/documents, fuera de cualquier carpeta pública y de git', () => {
    const documentsDir = relative(repoRoot, DEFAULT_DOCUMENTS_DIR).split(sep).join('/');
    expect(documentsDir).toBe('backend/storage/documents');
    expect(versionable.some((path) => path.toLowerCase().endsWith('.pdf'))).toBe(false);
    expect(git('check-ignore', '--no-index', `${documentsDir}/seed/x.pdf`).trim()).toBe(`${documentsDir}/seed/x.pdf`);
  });

  it('el README documenta las 11 cuentas demo como credenciales de demostración, sin contraseñas', () => {
    const readme = textFiles.find((f) => f.path === 'README.md')?.text ?? '';
    const section = readme.slice(readme.indexOf('## Cuentas demo'));
    expect(section).toContain('solo para el entorno de demostración');
    for (const account of DEMO_ACCOUNTS) {
      expect(section).toContain(account.email);
      expect(section).toContain(account.variable);
    }
  });
});
