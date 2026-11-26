// Pruebas de la paginación (tarea 3.3, Req. 13.6, 13.7).
// La prueba de propiedades (Property 41) corresponde a la tarea 3.4.

import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAGE_MESSAGE,
  PAGE_SIZE_MESSAGE,
  parseIntegerString,
  parsePagination,
  toPage,
} from '../../src/domain/others';
import { ValidationError } from '../../src/lib/errors';
import { errorHandler } from '../../src/middlewares/errorHandler';

function paginationError(query: Record<string, unknown>): ValidationError {
  try {
    parsePagination(query);
  } catch (error) {
    if (error instanceof ValidationError) return error;
    throw error;
  }
  throw new Error('parsePagination no rechazó la consulta');
}

describe('parseIntegerString', () => {
  it('acepta textos con solo dígitos (y signo) y enteros seguros', () => {
    expect(parseIntegerString('0')).toBe(0);
    expect(parseIntegerString('42')).toBe(42);
    expect(parseIntegerString('-3')).toBe(-3);
    expect(parseIntegerString('010')).toBe(10);
    expect(parseIntegerString(7)).toBe(7);
  });

  it.each([
    'abc', '', ' ', ' 5', '5 ', '1.5', '1.0', '1e2', '0x10', '+5', '5a', '--1', '9007199254740993',
  ])('rechaza el texto %j', (value) => {
    expect(parseIntegerString(value)).toBeNull();
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53, undefined, null, true, ['5'], { n: 5 }])(
    'rechaza el valor %j',
    (value) => {
      expect(parseIntegerString(value)).toBeNull();
    },
  );
});

describe('parsePagination', () => {
  it('sin parámetros usa la página 1 y el tamaño 10', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 10, skip: 0, take: 10 });
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });

  it('un parámetro vacío o con solo espacios cuenta como no indicado', () => {
    expect(parsePagination({ page: '', pageSize: '   ' })).toEqual({ page: 1, pageSize: 10, skip: 0, take: 10 });
  });

  it('acepta los límites 1 y 100 y calcula el desplazamiento', () => {
    expect(parsePagination({ pageSize: '1' })).toMatchObject({ pageSize: 1, take: 1 });
    expect(parsePagination({ pageSize: '100' })).toMatchObject({ pageSize: 100, take: 100 });
    expect(MAX_PAGE_SIZE).toBe(100);
    expect(parsePagination({ page: '3', pageSize: '20' })).toEqual({ page: 3, pageSize: 20, skip: 40, take: 20 });
  });

  it.each(['0', '101', 'abc', '-1', '1.5', '1e1', ' 5', '0x10', '9007199254740993'])(
    'pageSize=%j produce 400 con el error en pageSize',
    (pageSize) => {
      const error = paginationError({ pageSize });
      expect(error.status).toBe(400);
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual([{ field: 'pageSize', message: PAGE_SIZE_MESSAGE }]);
    },
  );

  it('rechaza un pageSize repetido (arreglo) o anidado (objeto)', () => {
    expect(paginationError({ pageSize: ['5', '6'] }).errors).toEqual([{ field: 'pageSize', message: PAGE_SIZE_MESSAGE }]);
    expect(paginationError({ pageSize: { a: '5' } }).errors).toEqual([{ field: 'pageSize', message: PAGE_SIZE_MESSAGE }]);
  });

  it.each(['0', '-2', 'abc', '1.0', '9007199254740991'])('page=%j produce 400 con el error en page', (page) => {
    expect(paginationError({ page }).errors).toEqual([{ field: 'page', message: PAGE_MESSAGE }]);
  });

  it('informa los dos parámetros si ambos son inválidos', () => {
    expect(paginationError({ page: 'x', pageSize: '0' }).errors.map((e) => e.field).sort()).toEqual(['page', 'pageSize']);
  });

  it('los mensajes están en español', () => {
    expect(PAGE_SIZE_MESSAGE).toBe('El tamaño de página debe ser un número entero entre 1 y 100.');
    expect(paginationError({ pageSize: '0' }).message).toBe('Los parámetros de paginación no son válidos.');
  });
});

describe('toPage', () => {
  it('arma { data, page, pageSize, total }', () => {
    expect(toPage(['a', 'b'], 42, { page: 2, pageSize: 2 })).toEqual({ data: ['a', 'b'], page: 2, pageSize: 2, total: 42 });
  });
});

describe('Paginación a través de una ruta HTTP', () => {
  const items = Array.from({ length: 42 }, (_, index) => ({ id: index + 1 }));
  const app = express();
  app.get('/items', (req, res) => {
    const pagination = parsePagination(req.query);
    const data = items.slice(pagination.skip, pagination.skip + pagination.take);
    res.json(toPage(data, items.length, pagination));
  });
  app.use(errorHandler({ log: () => undefined }));

  it('sin parámetros devuelve la página 1 con 10 elementos y el total', async () => {
    const response = await request(app).get('/items');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ page: 1, pageSize: 10, total: 42 });
    expect(response.body.data).toHaveLength(10);
    expect(response.body.data[0]).toEqual({ id: 1 });
  });

  it('respeta page y pageSize válidos', async () => {
    const response = await request(app).get('/items').query({ page: '5', pageSize: '10' });
    expect(response.body).toMatchObject({ page: 5, pageSize: 10, total: 42 });
    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([41, 42]);
    const all = await request(app).get('/items').query({ pageSize: '100' });
    expect(all.body.data).toHaveLength(42);
  });

  it.each(['pageSize=0', 'pageSize=101', 'pageSize=abc', 'pageSize=1&pageSize=2'])(
    '%s responde 400 con el sobre de error y errors[] por campo',
    async (queryString) => {
      const response = await request(app).get(`/items?${queryString}`);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        code: 'VALIDATION_ERROR',
        message: 'Los parámetros de paginación no son válidos.',
        errors: [{ field: 'pageSize', message: PAGE_SIZE_MESSAGE }],
      });
    },
  );
});
