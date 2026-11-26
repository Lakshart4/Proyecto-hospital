// Prueba de propiedades del sobre de error (tarea 3.2).
// Cada error generado se lanza desde una ruta Express real y pasa por el errorHandler de la app
// (que usa toErrorResponse); la respuesta se lee con supertest.

import express from 'express';
import fc from 'fast-check';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import {
  AdminAuthorizationRequiredError,
  ConflictError,
  ForbiddenError,
  InternalError,
  MethodNotAllowedError,
  NotFoundError,
  PasswordChangeRequiredError,
  TooManyRequestsError,
  UnauthenticatedError,
  ValidationError,
  type AppError,
} from '../../src/lib/errors';
import { errorHandler } from '../../src/middlewares/errorHandler';

const RUNS = { numRuns: 100 };

/** Marca insertada en todo el contenido técnico generado, para detectar cualquier fuga. */
const MARK = 'ZQXFUGA';

/**
 * Marca propia de la query string. Es distinta de MARK porque la traza que se registra en el
 * servidor sí puede contener MARK (forma parte del mensaje técnico del error).
 */
const QUERY_MARK = 'QRYMARCA';

/** Estado HTTP de cada código de error, según la tabla de errores del diseño (escrita aquí de forma independiente). */
const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  PASSWORD_CHANGE_REQUIRED: 403,
  AUTORIZACION_ADMIN_REQUERIDA: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
};

const GENERIC_500 = 'Ocurrió un error interno. Inténtalo de nuevo más tarde.';

/** Heurística de texto en español: palabras funcionales o caracteres propios del español. */
const looksSpanish = (text: string) =>
  /[áéíóúñ¿¡]/i.test(text) || /\b(el|la|los|las|de|del|no|que|un|una|se|es|ya|con|para|esta)\b/i.test(text);

// ---------- Generadores ----------

/** Texto técnico con fugas típicas: rutas, trazas, SQL y valores de la solicitud, siempre con MARK. */
const leakArb = fc
  .tuple(
    fc.constantFrom(
      'SELECT * FROM "User" WHERE "email" = ?',
      'INSERT INTO "Patient" ("internalId") VALUES (?)',
      'at Object.handler (C:\\Users\\dev\\backend\\src\\services\\patients.service.ts:42:13)',
      '/home/dev/backend/node_modules/@prisma/client/runtime/library.js:121',
      'Invalid `prisma.user.create()` invocation',
      'SQLITE_CONSTRAINT: FOREIGN KEY constraint failed',
      'TypeError: Cannot read properties of undefined (reading "id")',
    ),
    fc.string({ maxLength: 30 }),
  )
  .map(([fragment, extra]) => `${MARK} ${fragment} ${extra} ${MARK}`);

const spanishMessageArb = fc.constantFrom(
  'El ID interno ya existe.',
  'La habitación está ocupada.',
  'No tienes permiso para realizar esta acción.',
  'El paciente no está activo.',
  'Los datos enviados no son válidos.',
);

const fieldErrorsArb = fc.array(
  fc.record({
    field: fc.constantFrom('name', 'internalId', 'email', 'quantity', 'scheduledAt'),
    message: fc.constantFrom('El campo es obligatorio.', 'El valor no es válido.', 'Debe ser un número entero.'),
  }),
  { maxLength: 4 },
);

interface Case {
  /** Lo que lanza la ruta. */
  thrown: unknown;
  /** Código esperado en la respuesta. */
  code: string;
  /** Mensaje esperado, o null si basta con que esté en español. */
  message: string | null;
  /** errors[] esperado en los 400. */
  errors?: { field: string; message: string }[];
}

/** Errores de la aplicación (AppError) con mensaje por defecto o con un mensaje en español. */
const appErrorCaseArb: fc.Arbitrary<Case> = fc
  .tuple(
    fc.constantFrom<() => AppError>(
      () => new UnauthenticatedError(),
      () => new ForbiddenError(),
      () => new PasswordChangeRequiredError(),
      () => new AdminAuthorizationRequiredError(),
      () => new NotFoundError(),
      () => new MethodNotAllowedError(),
      () => new ConflictError(),
      () => new TooManyRequestsError(),
      () => new InternalError(),
    ),
    fc.option(spanishMessageArb, { nil: undefined }),
  )
  .map(([make, message]) => {
    const base = make();
    const error = message === undefined ? base : Object.assign(make(), { message });
    return { thrown: error, code: base.code, message: error.message };
  });

const validationCaseArb: fc.Arbitrary<Case> = fc
  .tuple(fc.option(spanishMessageArb, { nil: undefined }), fieldErrorsArb)
  .map(([message, errors]) => {
    const error = message === undefined ? new ValidationError(undefined, errors) : new ValidationError(message, errors);
    return { thrown: error, code: 'VALIDATION_ERROR', message: error.message, errors };
  });

/** Errores desconocidos con mensajes técnicos, también lanzados como valores que no son Error. */
const unknownCaseArb: fc.Arbitrary<Case> = fc
  .tuple(leakArb, fc.constantFrom('Error', 'TypeError', 'RangeError', 'string', 'object', 'number'))
  .map(([leak, kind]) => {
    let thrown: unknown;
    if (kind === 'Error') thrown = new Error(leak);
    else if (kind === 'TypeError') thrown = new TypeError(leak);
    else if (kind === 'RangeError') thrown = new RangeError(leak);
    else if (kind === 'string') thrown = leak;
    else if (kind === 'object') thrown = { message: leak, stack: leak, code: 'P2002', sql: leak };
    else thrown = 1234;
    return { thrown, code: 'INTERNAL_ERROR', message: GENERIC_500 };
  });

/** Errores con la forma de PrismaClientKnownRequestError, con mensaje y metadatos técnicos. */
const prismaCaseArb: fc.Arbitrary<Case> = fc
  .tuple(fc.constantFrom('P2002', 'P2025', 'P2003', 'P2000', 'P2034'), leakArb)
  .map(([code, leak]) => {
    const thrown = Object.assign(new Error(leak), {
      name: 'PrismaClientKnownRequestError',
      code,
      clientVersion: '6.19.3',
      meta: { target: [`${MARK}_campo`], cause: leak, modelName: `${MARK}Model` },
    });
    if (code === 'P2002') return { thrown, code: 'CONFLICT', message: null };
    if (code === 'P2025') return { thrown, code: 'NOT_FOUND', message: null };
    // P2003 sin contexto de operación y los códigos sin traducción segura terminan en 500 genérico.
    return { thrown, code: 'INTERNAL_ERROR', message: GENERIC_500 };
  });

/** Errores del lector de JSON de Express, con mensaje técnico. */
const bodyParserCaseArb: fc.Arbitrary<Case> = fc
  .tuple(fc.constantFrom('entity.parse.failed', 'entity.too.large', 'encoding.unsupported', 'charset.unsupported'), leakArb)
  .map(([type, leak]) => ({
    thrown: Object.assign(new SyntaxError(leak), { type, status: 400, body: leak }),
    code: 'VALIDATION_ERROR',
    message: null,
  }));

const caseArb = fc.oneof(appErrorCaseArb, validationCaseArb, unknownCaseArb, prismaCaseArb, bodyParserCaseArb);

// ---------- App de prueba: una ruta que lanza el error del caso actual ----------

let current: { thrown: unknown; async: boolean } = { thrown: null, async: false };
const logged: string[] = [];

const app = express();
app.get('/fallo', async () => {
  if (current.async) await Promise.resolve();
  throw current.thrown;
});
app.use(errorHandler({ log: (message) => logged.push(message) }));

// ---------- Propiedad ----------

describe('Sobre de error (propiedades)', () => {
  // Feature: hospital-management-system, Property 40: Sobre de error uniforme y sin fugas
  it('Property 40: todo error produce { code, message } en español con el estado HTTP que corresponde y sin fugas', async () => {
    await fc.assert(
      fc.asyncProperty(caseArb, fc.boolean(), fc.string({ maxLength: 20 }), async (testCase, isAsync, query) => {
        current = { thrown: testCase.thrown, async: isAsync };
        logged.length = 0;

        const response = await request(app).get('/fallo').query({ q: `${QUERY_MARK}${query}` });
        const body = response.body as Record<string, unknown>;

        // Forma uniforme: JSON UTF-8 con code y message; errors solo en 400.
        expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
        const expectedKeys = response.status === 400 ? ['code', 'errors', 'message'] : ['code', 'message'];
        expect(Object.keys(body).sort()).toEqual(expectedKeys);

        // Código esperado y estado HTTP que le corresponde.
        expect(body.code).toBe(testCase.code);
        expect(response.status).toBe(STATUS_BY_CODE[testCase.code]);

        // Mensaje en español.
        expect(typeof body.message).toBe('string');
        if (testCase.message !== null) expect(body.message).toBe(testCase.message);
        expect(looksSpanish(body.message as string), `mensaje no reconocido como español: ${String(body.message)}`).toBe(true);

        // errors[] por campo en los 400.
        if (response.status === 400) {
          expect(Array.isArray(body.errors)).toBe(true);
          for (const fieldError of body.errors as unknown[]) {
            expect(Object.keys(fieldError as object).sort()).toEqual(['field', 'message']);
          }
          if (testCase.errors) expect(body.errors).toEqual(testCase.errors);
        }

        // Sin fugas: ni el mensaje técnico, ni metadatos, ni la ruta, ni la query de la solicitud.
        expect(response.text).not.toContain(MARK);
        expect(response.text).not.toContain(QUERY_MARK);
        expect(response.text).not.toMatch(/\bat \S+ \(|\.ts:\d+|node_modules|SELECT |INSERT INTO|SQLITE_|prisma\./i);

        // La traza de los 500 va solo al registro del servidor, sin la query string.
        // (Los errores desconocidos ya se comprobaron arriba con el mensaje genérico; un InternalError
        // creado por la aplicación conserva su propio mensaje en español.)
        if (response.status === 500) {
          expect(logged).toHaveLength(1);
          expect(logged[0]).toContain('GET /fallo');
          expect(logged[0]).not.toContain(QUERY_MARK);
        } else {
          expect(logged).toEqual([]);
        }
      }),
      RUNS,
    );
  });
});
