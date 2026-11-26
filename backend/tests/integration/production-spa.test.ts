import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app';

let publicDir: string;
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), 'hospital-spa-'));
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><title>HospitalManager</title><div id="root"></div>');
  app = createApp({
    corsOrigin: 'http://localhost:3000', sessionSecret: 'test-secret-with-more-than-32-characters', db: {} as never,
    publicDir, logError: () => undefined,
  });
});

afterEach(() => { rmSync(publicDir, { recursive: true, force: true }); });

describe('Aplicación web única en producción', () => {
  it('sirve la SPA en rutas frontend sin capturar errores /api ni otros métodos', async () => {
    const spa = await request(app).get('/pacientes/14').expect(200);
    expect(spa.text).toContain('HospitalManager');
    expect(spa.headers['content-type']).toMatch(/html/);

    for (const path of ['/api', '/api/no-existe', '/api/unknown/nested']) {
      const response = await request(app).get(path).expect(404);
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.text).not.toContain('HospitalManager');
    }
    await request(app).post('/pacientes').expect(404);
  });
});
