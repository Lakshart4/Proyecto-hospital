import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Express } from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';

let publicDir: string;

function testApp(withIpRoute = false): Express {
  return createApp({
    corsOrigin: 'http://localhost:3000', sessionSecret: 'test-secret-with-more-than-32-characters', db: {} as never,
    publicDir, logError: () => undefined,
    ...(withIpRoute ? { extraRoutes: (router) => {
      router.get('/test-client-ip', (req, res) => { res.json({ ip: req.ip }); });
    } } : {}),
  });
}

beforeEach(() => {
  publicDir = mkdtempSync(join(tmpdir(), 'hospital-http-security-'));
  writeFileSync(join(publicDir, 'index.html'), '<!doctype html><script type="module" src="/assets/app.js"></script><link rel="stylesheet" href="/assets/app.css"><div id="root"></div>');
  writeFileSync(join(publicDir, 'app.js'), 'export {};');
  writeFileSync(join(publicDir, 'app.css'), 'body{}');
});

afterEach(() => {
  rmSync(publicDir, { recursive: true, force: true });
  vi.unstubAllEnvs();
});

function expectCommonHeaders(response: request.Response) {
  expect(response.headers['x-content-type-options']).toBe('nosniff');
  expect(response.headers['x-frame-options']).toBe('DENY');
  expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(response.headers['permissions-policy']).toContain('camera=()');
  const csp = response.headers['content-security-policy'] as string;
  expect(csp).toContain("script-src 'self'");
  expect(csp).toContain("style-src 'self' 'unsafe-inline'");
  expect(csp).toContain("img-src 'self' data: blob:");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain('unsafe-eval');
}

describe('Encabezados HTTP y proxy de producción', () => {
  it('aplica una CSP compatible a API, SPA y recursos locales', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const app = testApp();
    const api = await request(app).get('/api/health').expect(200);
    expectCommonHeaders(api);
    expect(api.headers['strict-transport-security']).toBe('max-age=31536000');

    const spa = await request(app).get('/pacientes/14').expect(200);
    expectCommonHeaders(spa);
    expect(spa.text).toContain('/assets/app.js');
    const script = await request(app).get('/assets/app.js').expect(200);
    expectCommonHeaders(script);
    const notFound = await request(app).get('/api/no-existe').expect(404);
    expectCommonHeaders(notFound);
    expect(notFound.body.code).toBe('NOT_FOUND');
  });

  it('no envía HSTS fuera de producción', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const response = await request(testApp()).get('/api/health').expect(200);
    expectCommonHeaders(response);
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('usa X-Forwarded-For solo en la topología de producción', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const forwarded = await request(testApp(true)).get('/api/test-client-ip').set('X-Forwarded-For', '203.0.113.24').expect(200);
    expect(forwarded.body.ip).toBe('203.0.113.24');

    vi.stubEnv('NODE_ENV', 'development');
    const direct = await request(testApp(true)).get('/api/test-client-ip').set('X-Forwarded-For', '203.0.113.24').expect(200);
    expect(direct.body.ip).not.toBe('203.0.113.24');
  });
});
