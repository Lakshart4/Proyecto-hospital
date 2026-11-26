// Prueba de propiedades de la paginación (tarea 3.4).
// Una ruta Express de prueba pagina un conjunto generado igual que lo hará un servicio:
// parsePagination(req.query) -> recorte con skip/take -> toPage. La respuesta se lee con supertest
// y pasa por el errorHandler real. El resultado esperado se calcula de forma independiente,
// por el índice de cada elemento (elemento i pertenece a la página floor(i / tamaño) + 1).

import express from 'express';
import fc from 'fast-check';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { parsePagination, toPage, type Page } from '../../src/domain/others';
import { errorHandler } from '../../src/middlewares/errorHandler';

const RUNS = { numRuns: 100 };

/** Tamaño por defecto exigido por el Req. 13.6, escrito aquí de forma independiente. */
const EXPECTED_DEFAULT_SIZE = 10;

interface Item {
  id: number;
}

/** Lo que hará un servicio con la paginación: recortar el conjunto y armar la respuesta. */
function listItems(items: Item[], query: Record<string, unknown>): Page<Item> {
  const pagination = parsePagination(query);
  return toPage(items.slice(pagination.skip, pagination.skip + pagination.take), items.length, pagination);
}

/** Elementos que deben aparecer en una página, calculados por índice. */
const expectedPage = (items: Item[], page: number, size: number) =>
  items.filter((_, index) => Math.floor(index / size) === page - 1);

let currentItems: Item[] = [];
const app = express();
app.get('/items', (req, res) => {
  res.json(listItems(currentItems, req.query));
});
app.use(errorHandler({ log: () => undefined }));

// ---------- Generadores ----------

/** Conjuntos de 0 a 250 elementos con id único (más de 100 para cubrir varias páginas del tamaño máximo). */
const itemsArb = fc
  .uniqueArray(fc.integer({ min: 1, max: 1_000_000 }), { maxLength: 250 })
  .map((ids) => ids.map((id) => ({ id })));

/** Tamaños válidos, con los límites 1 y 100 y el valor por defecto 10 más probables. */
const validSizeArb = fc.oneof(fc.constantFrom(1, 10, 100), fc.integer({ min: 1, max: 100 }));

/** Página solicitada: hasta 30 (más allá del final con tamaños grandes) o no indicada. */
const pageArb = fc.option(fc.integer({ min: 1, max: 30 }), { nil: undefined });

/** pageSize no entero o fuera de [1, 100]. Los valores vacíos cuentan como "no indicado" (tarea 3.3). */
const invalidSizeArb = fc.oneof(
  fc.integer({ min: -1_000_000, max: 0 }).map(String),
  fc.integer({ min: 101, max: 1_000_000_000 }).map(String),
  fc.bigInt({ min: 2n ** 53n, max: 2n ** 70n }).map(String),
  fc.tuple(fc.integer({ min: 0, max: 100 }), fc.integer({ min: 1, max: 99 })).map(([a, b]) => `${a}.${b}`),
  fc.constantFrom('abc', '1e1', '0x10', '10abc', ' 5', '5 ', '+5', 'NaN', 'Infinity', '10.0', '-0.5'),
  fc.string({ minLength: 1, maxLength: 8 }).filter((s) => s.trim() !== '' && !/^-?\d+$/.test(s)),
);

type Scenario =
  | { kind: 'valid'; size: number; page: number | undefined }
  | { kind: 'default'; page: number | undefined }
  | { kind: 'invalid'; size: string; page: number | undefined };

const scenarioArb: fc.Arbitrary<Scenario> = fc.oneof(
  fc.record({ kind: fc.constant('valid' as const), size: validSizeArb, page: pageArb }),
  fc.record({ kind: fc.constant('default' as const), page: pageArb }),
  fc.record({ kind: fc.constant('invalid' as const), size: invalidSizeArb, page: pageArb }),
);

// ---------- Propiedad ----------

describe('Paginación (propiedades)', () => {
  // Feature: hospital-management-system, Property 41: Paginación
  it('Property 41: con tamaño entero en [1, 100] (o 10 por defecto) se devuelve la página pedida con el total; si no, 400', async () => {
    await fc.assert(
      fc.asyncProperty(itemsArb, scenarioArb, async (items, scenario) => {
        currentItems = items;
        const query: Record<string, string> = {};
        if (scenario.page !== undefined) query.page = String(scenario.page);
        if (scenario.kind !== 'default') query.pageSize = String(scenario.size);

        const response = await request(app).get('/items').query(query);

        if (scenario.kind === 'invalid') {
          // Fuera de rango o no entero: 400 con el sobre de error y el error en pageSize, sin datos.
          expect(response.status).toBe(400);
          expect(response.body.code).toBe('VALIDATION_ERROR');
          expect(response.body).not.toHaveProperty('data');
          expect(response.body.errors).toContainEqual({ field: 'pageSize', message: expect.any(String) });
          return;
        }

        const size = scenario.kind === 'valid' ? scenario.size : EXPECTED_DEFAULT_SIZE;
        const page = scenario.page ?? 1;
        const body = response.body as Page<Item>;

        // Metadatos: la página solicitada, el tamaño aplicado y el total del conjunto.
        expect(response.status).toBe(200);
        expect(Object.keys(body).sort()).toEqual(['data', 'page', 'pageSize', 'total']);
        expect(body.page).toBe(page);
        expect(body.pageSize).toBe(size);
        expect(body.total).toBe(items.length);

        // Como máximo `tamaño` elementos, y exactamente los que corresponden a esa página.
        expect(body.data.length).toBeLessThanOrEqual(size);
        expect(body.data).toEqual(expectedPage(items, page, size));

        // Recorrer todas las páginas reconstruye el conjunto en orden: sin duplicados ni omisiones.
        const lastPage = Math.max(1, Math.ceil(items.length / size));
        const sizeQuery = scenario.kind === 'valid' ? { pageSize: String(size) } : {};
        const pages = Array.from({ length: lastPage }, (_, index) =>
          listItems(items, { ...sizeQuery, page: String(index + 1) }),
        );
        expect(pages.flatMap((p) => p.data)).toEqual(items);
        pages.forEach((p, index) => {
          expect(p.total).toBe(items.length);
          if (index < lastPage - 1) expect(p.data).toHaveLength(size);
        });
        // Una página posterior a la última está vacía y conserva el total.
        const beyond = listItems(items, { ...sizeQuery, page: String(lastPage + 1) });
        expect(beyond.data).toEqual([]);
        expect(beyond.total).toBe(items.length);
      }),
      RUNS,
    );
  });
});
