// App Express, CORS, manejo de errores y arranque/cierre del servidor (tarea 3.1; Req. 13.3, 13.4, 13.8, 13.9, 13.10).

import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { ConflictError } from '../../src/lib/errors';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { startServer } from '../../src/server';

const ALLOWED_ORIGIN = 'http://localhost:5173';
const FOREIGN_ORIGIN = 'http://otro-sitio.example.com';

function testApp() {
  const errors: string[] = [];
  const app = createApp({ corsOrigin: ALLOWED_ORIGIN, sessionSecret: randomBytes(32).toString('hex'), logError: (message) => errors.push(message) });
  return { app, errors };
}

const accessControlHeaders = (headers: Record<string, unknown>) =>
  Object.keys(headers).filter((name) => name.toLowerCase().startsWith('access-control-'));

describe('GET /api/health', () => {
  it('responde 200 con JSON UTF-8 y sin la cabecera X-Powered-By', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('otros métodos sobre una ruta existente dan 405 con la cabecera Allow', async () => {
    const { app } = testApp();
    const response = await request(app).post('/api/health').send({});
    expect(response.status).toBe(405);
    expect(response.headers.allow).toBe('GET, HEAD');
    expect(response.body).toEqual({ code: 'METHOD_NOT_ALLOWED', message: 'Esta operación no está permitida sobre este recurso.' });
  });
});

describe('CORS', () => {
  it('el origen permitido recibe las cabeceras CORS con credenciales', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/health').set('Origin', ALLOWED_ORIGIN);
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers.vary).toContain('Origin');
  });

  it('el preflight del origen permitido responde 204 en menos de 500 ms', async () => {
    const { app } = testApp();
    const started = performance.now();
    const response = await request(app)
      .options('/api/health')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type');
    const elapsed = performance.now() - started;
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    expect(elapsed).toBeLessThan(500);
  });

  it('un origen ajeno se rechaza con 403 y sin ninguna cabecera Access-Control-*, también en el preflight', async () => {
    const { app } = testApp();
    const simple = await request(app).get('/api/health').set('Origin', FOREIGN_ORIGIN);
    expect(simple.status).toBe(403);
    expect(simple.body).toEqual({ code: 'FORBIDDEN', message: 'El origen de la solicitud no está permitido.' });
    expect(accessControlHeaders(simple.headers)).toEqual([]);

    const preflight = await request(app)
      .options('/api/health')
      .set('Origin', FOREIGN_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(preflight.status).toBe(403);
    expect(accessControlHeaders(preflight.headers)).toEqual([]);

    const nullOrigin = await request(app).get('/api/health').set('Origin', 'null');
    expect(nullOrigin.status).toBe(403);
    expect(accessControlHeaders(nullOrigin.headers)).toEqual([]);
  });

  it('una solicitud sin cabecera Origin funciona sin cabeceras CORS', async () => {
    const { app } = testApp();
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(accessControlHeaders(response.headers)).toEqual([]);
  });
});

describe('Errores de la app', () => {
  it('una ruta inexistente da 404 con el sobre de error en español', async () => {
    const { app } = testApp();
    for (const path of ['/api/no-existe', '/no-existe']) {
      const response = await request(app).get(path);
      expect(response.status).toBe(404);
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.body).toEqual({ code: 'NOT_FOUND', message: 'La ruta solicitada no existe.' });
    }
  });

  it('un JSON mal formado da 400 con errors[] y sin detalles del lector de JSON', async () => {
    const { app, errors } = testApp();
    const response = await request(app).post('/api/health').set('Content-Type', 'application/json').send('{"nombre": ');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      code: 'VALIDATION_ERROR',
      message: 'El cuerpo de la solicitud no es un JSON válido.',
      errors: [{ field: 'body', message: 'El JSON tiene un formato incorrecto.' }],
    });
    expect(errors).toEqual([]);
  });

  it('un cuerpo mayor que el límite da 400', async () => {
    const { app } = testApp();
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ texto: 'x'.repeat(1_100_000) }));
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('El cuerpo de la solicitud es demasiado grande.');
  });
});

describe('errorHandler', () => {
  function appThatThrows(handler: express.RequestHandler) {
    const logged: string[] = [];
    const app = express();
    app.get('/fallo', handler);
    app.use(errorHandler({ log: (message) => logged.push(message) }));
    return { app, logged };
  }

  it('un error desconocido da 500 genérico sin traza, ruta ni SQL, y la traza solo va al registro del servidor', async () => {
    const leak = 'SELECT * FROM "User" WHERE email = ? at C:\\Users\\dev\\backend\\src\\services\\x.ts:12:5';
    const { app, logged } = appThatThrows(() => {
      throw new Error(leak);
    });
    const response = await request(app).get('/fallo?token=secreto-de-consulta');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno. Inténtalo de nuevo más tarde.' });
    const text = response.text;
    for (const fragment of ['SELECT', 'C:\\', 'x.ts', 'at ', 'stack', 'Error']) expect(text).not.toContain(fragment);

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('GET /fallo');
    expect(logged[0]).toContain('SELECT');
    expect(logged[0]).not.toContain('secreto-de-consulta');
  });

  it('una promesa rechazada en una ruta asíncrona también termina en 500 genérico (Express 5)', async () => {
    const { app } = appThatThrows(async () => {
      await Promise.resolve();
      throw new Error('fallo asíncrono interno');
    });
    const response = await request(app).get('/fallo');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('fallo asíncrono interno');
  });

  it('un AppError conserva su estado y mensaje y no se registra como error del servidor', async () => {
    const { app, logged } = appThatThrows(() => {
      throw new ConflictError('La habitación está ocupada.');
    });
    const response = await request(app).get('/fallo');
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ code: 'CONFLICT', message: 'La habitación está ocupada.' });
    expect(logged).toEqual([]);
  });

  it('un error con forma de error de Prisma sin traducción segura no expone su código ni su mensaje', async () => {
    const prismaLike = Object.assign(new Error('Foreign key constraint violated on the foreign key'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2003',
    });
    const { app } = appThatThrows(() => {
      throw prismaLike;
    });
    const response = await request(app).get('/fallo');
    expect(response.status).toBe(500);
    expect(response.text).not.toContain('P2003');
    expect(response.text).not.toContain('Foreign key');
  });
});

describe('Servidor HTTP', () => {
  const config = loadEnv({
    SESSION_SECRET: randomBytes(48).toString('hex'),
    DATABASE_URL: 'file:./no-se-usa.db',
    CORS_ORIGIN: ALLOWED_ORIGIN,
  }).config;

  it('inicia en el puerto indicado, atiende solicitudes y se cierra desconectando la base de datos', async () => {
    const disconnect = vi.fn(async () => undefined);
    const running = await startServer({ ...config, port: 0 }, { disconnect });
    expect(running.server.listening).toBe(true);
    expect(running.port).toBeGreaterThan(0);

    const response = await fetch(`http://127.0.0.1:${running.port}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });

    await running.close();
    expect(running.server.listening).toBe(false);
    expect(disconnect).toHaveBeenCalledTimes(1);
    await expect(fetch(`http://127.0.0.1:${running.port}/api/health`)).rejects.toThrow();
  });

  it('informa en español si el puerto ya está en uso', async () => {
    const first = await startServer({ ...config, port: 0 }, { disconnect: async () => undefined });
    try {
      await expect(startServer({ ...config, port: first.port }, { disconnect: async () => undefined })).rejects.toThrow(
        `No se pudo iniciar el servidor en el puerto ${first.port}: el puerto ya está en uso.`,
      );
    } finally {
      await first.close();
    }
  });
});
