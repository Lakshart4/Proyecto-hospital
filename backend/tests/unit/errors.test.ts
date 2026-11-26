import { describe, expect, it } from 'vitest';
import {
  AdminAuthorizationRequiredError,
  AppError,
  ConflictError,
  ForbiddenError,
  GENERIC_INTERNAL_MESSAGE,
  InternalError,
  MethodNotAllowedError,
  NotFoundError,
  PasswordChangeRequiredError,
  TooManyRequestsError,
  UnauthenticatedError,
  ValidationError,
  isPrismaKnownError,
  toErrorResponse,
  translatePrismaError,
} from '../../src/lib/errors';
import { runWithDbErrors } from '../../src/repositories/db-errors';

/** Imita la forma de PrismaClientKnownRequestError, con un mensaje técnico que no debe filtrarse. */
class FakePrismaError extends Error {
  readonly code: string;
  readonly meta?: Record<string, unknown>;
  readonly clientVersion = '6.19.3';

  constructor(code: string, meta?: Record<string, unknown>) {
    super(
      `Invalid \`prisma.user.create()\` invocation in C:\\Users\\dev\\backend\\src\\repositories\\users.ts:42:7\n` +
        `SQLITE_CONSTRAINT: INSERT INTO "User" ("email") VALUES ('secreto@example.com')`,
    );
    this.name = 'PrismaClientKnownRequestError';
    this.code = code;
    if (meta) this.meta = meta;
  }
}

const TECHNICAL_FRAGMENTS = ['prisma', 'Prisma', 'SQLITE', 'INSERT', 'invocation', 'C:\\', 'repositories', 'secreto@example.com', 'P20'];

function expectNoLeak(body: unknown) {
  const text = JSON.stringify(body);
  for (const fragment of TECHNICAL_FRAGMENTS) expect(text).not.toContain(fragment);
}

describe('Clases de error', () => {
  it('cada clase tiene su estado HTTP y su código', () => {
    const cases: [AppError, number, string][] = [
      [new ValidationError(), 400, 'VALIDATION_ERROR'],
      [new UnauthenticatedError(), 401, 'UNAUTHENTICATED'],
      [new ForbiddenError(), 403, 'FORBIDDEN'],
      [new PasswordChangeRequiredError(), 403, 'PASSWORD_CHANGE_REQUIRED'],
      [new AdminAuthorizationRequiredError(), 403, 'AUTORIZACION_ADMIN_REQUERIDA'],
      [new NotFoundError(), 404, 'NOT_FOUND'],
      [new MethodNotAllowedError(), 405, 'METHOD_NOT_ALLOWED'],
      [new ConflictError(), 409, 'CONFLICT'],
      [new TooManyRequestsError(), 429, 'TOO_MANY_REQUESTS'],
      [new InternalError(), 500, 'INTERNAL_ERROR'],
    ];
    for (const [error, status, code] of cases) {
      expect(error).toBeInstanceOf(AppError);
      expect(error.status).toBe(status);
      expect(error.code).toBe(code);
      expect(error.message.length).toBeGreaterThan(0);
    }
  });
});

describe('translatePrismaError', () => {
  it('reconoce los errores de Prisma por su forma y descarta los demás', () => {
    expect(isPrismaKnownError(new FakePrismaError('P2002'))).toBe(true);
    expect(isPrismaKnownError(new Error('P2002'))).toBe(false);
    expect(isPrismaKnownError({ name: 'PrismaClientKnownRequestError', code: 'P2002' })).toBe(false);
    expect(translatePrismaError(new Error('fallo'))).toBeNull();
  });

  it('P2002 da 409 con un mensaje según el campo único, sin repetir el valor', () => {
    const byField = translatePrismaError(new FakePrismaError('P2002', { target: ['internalId'] }));
    expect(byField).toBeInstanceOf(ConflictError);
    expect(byField?.status).toBe(409);
    expect(byField?.message).toBe('El ID interno ya existe.');

    expect(translatePrismaError(new FakePrismaError('P2002', { target: ['email'] }))?.message).toBe(
      'El correo electrónico ya está registrado.',
    );
    expect(translatePrismaError(new FakePrismaError('P2002', { target: 'User_internalId_key' }))?.message).toBe(
      'El ID interno ya existe.',
    );
    expect(translatePrismaError(new FakePrismaError('P2002', { target: ['campoDesconocido'] }))?.message).toBe(
      'Ya existe un registro con esos datos.',
    );
  });

  it('P2003 depende de la operación: 400 al crear o editar, 409 al eliminar y sin traducción sin contexto', () => {
    const error = new FakePrismaError('P2003', { field_name: 'departmentId' });

    const onCreate = translatePrismaError(error, { operation: 'create', referenceField: 'departmentId' });
    expect(onCreate).toBeInstanceOf(ValidationError);
    expect(onCreate?.status).toBe(400);
    expect((onCreate as ValidationError).errors).toEqual([
      { field: 'departmentId', message: 'El registro indicado no existe.' },
    ]);

    const onUpdate = translatePrismaError(error, { operation: 'update' });
    expect(onUpdate?.status).toBe(400);
    expect((onUpdate as ValidationError).errors).toEqual([]);

    const onDelete = translatePrismaError(error, { operation: 'delete' });
    expect(onDelete).toBeInstanceOf(ConflictError);
    expect(onDelete?.status).toBe(409);

    expect(translatePrismaError(error)).toBeNull();
    expect(translatePrismaError(error, { operation: 'read' })).toBeNull();
  });

  it('P2025 da 404', () => {
    const notFound = translatePrismaError(new FakePrismaError('P2025'), { operation: 'update' });
    expect(notFound).toBeInstanceOf(NotFoundError);
    expect(notFound?.status).toBe(404);
  });

  it('otros códigos de Prisma no se traducen', () => {
    expect(translatePrismaError(new FakePrismaError('P2000'), { operation: 'create' })).toBeNull();
  });
});

describe('runWithDbErrors', () => {
  it('traduce el error con el contexto de la operación', async () => {
    await expect(
      runWithDbErrors({ operation: 'delete' }, () => Promise.reject(new FakePrismaError('P2003'))),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      runWithDbErrors({ operation: 'create' }, () => Promise.reject(new FakePrismaError('P2003'))),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('vuelve a lanzar sin cambios los errores que no son de Prisma y devuelve el resultado si no hay error', async () => {
    const original = new Error('otro fallo');
    await expect(runWithDbErrors({ operation: 'create' }, () => Promise.reject(original))).rejects.toBe(original);
    await expect(runWithDbErrors({ operation: 'read' }, () => Promise.resolve(42))).resolves.toBe(42);
  });
});

describe('toErrorResponse', () => {
  it('mantiene estado, código y mensaje de un AppError; errors solo en 400', () => {
    const validation = toErrorResponse(new ValidationError('Datos inválidos.', [{ field: 'name', message: 'El nombre es obligatorio.' }]));
    expect(validation).toEqual({
      status: 400,
      body: { code: 'VALIDATION_ERROR', message: 'Datos inválidos.', errors: [{ field: 'name', message: 'El nombre es obligatorio.' }] },
    });

    const conflict = toErrorResponse(new ConflictError('El ID interno ya existe.'));
    expect(conflict).toEqual({ status: 409, body: { code: 'CONFLICT', message: 'El ID interno ya existe.' } });
    expect('errors' in conflict.body).toBe(false);
  });

  it('un error desconocido da 500 genérico sin traza, rutas ni SQL', () => {
    const error = new Error('SELECT * FROM "User" WHERE passwordHash = ... at C:\\Users\\dev\\backend\\src\\x.ts:10');
    const response = toErrorResponse(error);
    expect(response).toEqual({ status: 500, body: { code: 'INTERNAL_ERROR', message: GENERIC_INTERNAL_MESSAGE } });
    expect(JSON.stringify(response.body)).not.toContain('SELECT');
    expect(JSON.stringify(response.body)).not.toContain('C:\\');
  });

  it('los errores de Prisma nunca exponen mensaje técnico, código Prisma ni metadatos', () => {
    const responses = [
      toErrorResponse(new FakePrismaError('P2002', { target: ['email'] })),
      toErrorResponse(new FakePrismaError('P2025', { cause: 'Record to update not found.' })),
      toErrorResponse(new FakePrismaError('P2003', { field_name: 'departmentId' })),
      toErrorResponse(new FakePrismaError('P2000', { column_name: 'name' })),
      toErrorResponse(translatePrismaError(new FakePrismaError('P2003'), { operation: 'delete' })),
    ];
    expect(responses.map((r) => r.status)).toEqual([409, 404, 500, 500, 409]);
    for (const response of responses) {
      expectNoLeak(response.body);
      expect(Object.keys(response.body).sort()).toEqual(['code', 'message']);
    }
  });

  it('valores no Error también dan 500 genérico', () => {
    expect(toErrorResponse('texto').status).toBe(500);
    expect(toErrorResponse(null).status).toBe(500);
    expect(toErrorResponse({ code: 'P2002' }).status).toBe(500);
  });
});
