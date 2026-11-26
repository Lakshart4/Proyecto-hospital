// Pruebas del middleware `validate` (tarea 3.3, Req. 3.3, 3.4).
// Se monta en una app Express con el errorHandler real y se prueba con supertest.

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { toFieldErrors, validate } from '../../src/middlewares/validate';
import { intInRange, queryIntInRange, requiredText } from '../../src/schemas/common';

let handlerCalls = 0;

const app = express();
app.use(express.json());
app.post(
  '/items/:id',
  validate({
    params: z.object({ id: queryIntInRange(1, 1_000_000) }),
    query: z.object({ mode: z.enum(['rapido', 'normal']).optional() }),
    body: z.object({
      name: requiredText({ max: 20, required: 'El nombre es obligatorio.' }),
      quantity: intInRange(0, 1000),
      tags: z.array(z.object({ label: requiredText({ max: 10 }) })).optional(),
      active: z.boolean().optional(),
    }),
  }),
  (req, res) => {
    handlerCalls += 1;
    res.json({ params: req.params, query: req.query, body: req.body, idType: typeof req.params.id });
  },
);
app.use(errorHandler({ log: () => undefined }));

beforeEach(() => {
  handlerCalls = 0;
});

describe('validate', () => {
  it('con datos válidos ejecuta el controlador con los valores validados', async () => {
    const response = await request(app)
      .post('/items/15')
      .query({ mode: 'rapido', extra: 'x' })
      .send({ name: '  Gasas  ', quantity: 5, unknownKey: 'se descarta' });

    expect(response.status).toBe(200);
    expect(handlerCalls).toBe(1);
    expect(response.body).toEqual({
      params: { id: 15 },
      query: { mode: 'rapido' },
      body: { name: 'Gasas', quantity: 5 },
      idType: 'number',
    });
  });

  it('con datos inválidos responde 400 con errors[] por campo y no ejecuta el controlador', async () => {
    const response = await request(app)
      .post('/items/abc')
      .query({ mode: 'lento' })
      .send({ name: '   ', quantity: 1001 });

    expect(response.status).toBe(400);
    expect(handlerCalls).toBe(0);
    expect(response.body.code).toBe('VALIDATION_ERROR');
    expect(response.body.message).toBe('Los datos enviados no son válidos.');
    const byField = Object.fromEntries(
      (response.body.errors as { field: string; message: string }[]).map((e) => [e.field, e.message]),
    );
    expect(byField).toMatchObject({
      id: 'Debe ser un número entero entre 1 y 1000000.',
      name: 'El nombre es obligatorio.',
      quantity: 'Debe ser un número entero entre 0 y 1000.',
    });
    expect(byField.mode).toMatch(/inválid|esperaba/i);
    expect(Object.keys(byField).sort()).toEqual(['id', 'mode', 'name', 'quantity']);
  });

  it('identifica los campos anidados por su ruta', async () => {
    const response = await request(app)
      .post('/items/1')
      .send({ name: 'Gasas', quantity: 1, tags: [{ label: 'ok' }, { label: '  ' }] });
    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual([{ field: 'tags.1.label', message: 'Este campo es obligatorio.' }]);
  });

  it('los errores de tipo sin mensaje propio salen en español', async () => {
    const response = await request(app).post('/items/1').send({ name: 'Gasas', quantity: 1, active: 'sí' });
    expect(response.status).toBe(400);
    expect(response.body.errors[0].field).toBe('active');
    expect(response.body.errors[0].message).not.toMatch(/invalid|expected/i);
  });

  it('sin cuerpo informa el error en el campo body', async () => {
    const response = await request(app).post('/items/1');
    expect(response.status).toBe(400);
    expect(handlerCalls).toBe(0);
    expect(response.body.errors).toEqual([{ field: 'body', message: expect.any(String) }]);
    expect(response.body.errors[0].message).not.toMatch(/invalid|expected/i);
  });

  it('solo valida las partes indicadas', async () => {
    const only = express();
    only.get('/x', validate({ query: z.object({ q: requiredText({ max: 5 }) }) }), (req, res) => {
      res.json({ query: req.query });
    });
    only.use(errorHandler({ log: () => undefined }));
    expect((await request(only).get('/x').query({ q: ' ab ' })).body).toEqual({ query: { q: 'ab' } });
    expect((await request(only).get('/x')).status).toBe(400);
  });
});

describe('toFieldErrors', () => {
  it('conserva solo el primer mensaje de cada campo', () => {
    const result = z
      .object({ code: z.string().min(3, 'Muy corto.').regex(/^\d+$/, 'Solo dígitos.') })
      .safeParse({ code: 'a' });
    expect(result.success).toBe(false);
    expect(result.error && toFieldErrors(result.error.issues, 'body')).toEqual([{ field: 'code', message: 'Muy corto.' }]);
  });
});
