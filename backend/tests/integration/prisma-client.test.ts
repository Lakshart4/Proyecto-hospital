// Cliente Prisma, transacciones y traducción de errores reales de Prisma (tarea 2.2).
// Usa una base SQLite temporal con las migraciones aplicadas; no toca prisma/dev.db.

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError, ValidationError, toErrorResponse, translatePrismaError } from '../../src/lib/errors';
import { prisma as sharedClient } from '../../src/lib/prisma';
import { runWithDbErrors } from '../../src/repositories/db-errors';
import { withTransaction } from '../../src/repositories/transaction';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

let db: TempDatabase | undefined;
let client: PrismaClient;
let seq = 0;

beforeAll(() => {
  db = createTempDatabase('hm-client-');
  client = db.client;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

const next = () => ++seq;

function userData(departmentId: number, internalId = `C-${next()}`) {
  return {
    internalId,
    email: `${internalId.toLowerCase()}@example.com`,
    passwordHash: 'hash-ficticio',
    role: 'DOCTOR',
    name: 'Usuario de prueba',
    position: 'Cargo',
    specialty: 'Especialidad',
    departmentId,
    yearsExperience: 1,
    shift: 'matutino',
    phone: '555-0000',
  };
}

async function captureError(operation: Promise<unknown>): Promise<unknown> {
  try {
    await operation;
  } catch (error) {
    return error;
  }
  throw new Error('Se esperaba un error');
}

describe('Cliente Prisma compartido', () => {
  it('es una única instancia reutilizada por todos los módulos', async () => {
    const again = await import('../../src/lib/prisma.js');
    expect(again.prisma).toBe(sharedClient);
  });
});

describe('withTransaction', () => {
  it('confirma todos los cambios y devuelve el resultado si la operación termina bien', async () => {
    const name = `Confirmado ${next()}`;
    const result = await withTransaction(
      async (tx) => {
        const department = await tx.department.create({ data: { name } });
        const user = await tx.user.create({ data: userData(department.id) });
        return { departmentId: department.id, userId: user.id };
      },
      { client },
    );
    expect(await client.department.count({ where: { id: result.departmentId } })).toBe(1);
    expect(await client.user.count({ where: { id: result.userId } })).toBe(1);
  });

  it('revierte todos los cambios y relanza el mismo error si un paso falla', async () => {
    const name = `Revertido ${next()}`;
    const failure = new Error('fallo forzado después de escribir');
    await expect(
      withTransaction(
        async (tx) => {
          const department = await tx.department.create({ data: { name } });
          await tx.user.create({ data: userData(department.id) });
          throw failure;
        },
        { client },
      ),
    ).rejects.toBe(failure);
    expect(await client.department.count({ where: { name } })).toBe(0);
    expect(await client.user.count({ where: { department: { name } } })).toBe(0);
  });

  it('revierte los pasos anteriores cuando Prisma rechaza una escritura posterior', async () => {
    const name = `Revertido por FK ${next()}`;
    const error = await captureError(
      withTransaction(
        async (tx) => {
          await tx.department.create({ data: { name } });
          await tx.user.create({ data: userData(999_999) });
        },
        { client },
      ),
    );
    expect(translatePrismaError(error, { operation: 'create' })).toBeInstanceOf(ValidationError);
    expect(await client.department.count({ where: { name } })).toBe(0);
  });

  it('un AppError lanzado dentro de la transacción también revierte y conserva su tipo', async () => {
    const name = `Revertido por regla ${next()}`;
    await expect(
      withTransaction(
        async (tx) => {
          await tx.department.create({ data: { name } });
          throw new ConflictError('La habitación está ocupada.');
        },
        { client },
      ),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(await client.department.count({ where: { name } })).toBe(0);
  });
});

describe('Traducción de errores reales de Prisma', () => {
  it('P2002: un ID interno duplicado da 409 "El ID interno ya existe."', async () => {
    const department = await client.department.create({ data: { name: `Dup ${next()}` } });
    const existing = await client.user.create({ data: userData(department.id) });

    const error = await captureError(
      runWithDbErrors({ operation: 'create' }, () =>
        client.user.create({ data: { ...userData(department.id), internalId: existing.internalId } }),
      ),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe('El ID interno ya existe.');

    const emailError = await captureError(
      runWithDbErrors({ operation: 'create' }, () =>
        client.user.create({ data: { ...userData(department.id), email: existing.email } }),
      ),
    );
    expect((emailError as ConflictError).message).toBe('El correo electrónico ya está registrado.');
  });

  it('P2003 al crear o editar con una referencia inexistente da 400', async () => {
    const department = await client.department.create({ data: { name: `Ref ${next()}` } });
    const user = await client.user.create({ data: userData(department.id) });

    const onCreate = await captureError(
      runWithDbErrors({ operation: 'create', referenceField: 'departmentId' }, () =>
        client.user.create({ data: userData(999_999) }),
      ),
    );
    expect(onCreate).toBeInstanceOf(ValidationError);
    expect((onCreate as ValidationError).errors).toEqual([{ field: 'departmentId', message: 'El registro indicado no existe.' }]);

    const onUpdate = await captureError(
      runWithDbErrors({ operation: 'update', referenceField: 'departmentId' }, () =>
        client.user.update({ where: { id: user.id }, data: { departmentId: 999_999 } }),
      ),
    );
    expect(onUpdate).toBeInstanceOf(ValidationError);
    expect((await client.user.findUniqueOrThrow({ where: { id: user.id } })).departmentId).toBe(department.id);
  });

  it('P2003 al eliminar una entidad con dependientes da 409 y la conserva', async () => {
    const department = await client.department.create({ data: { name: `Con dependientes ${next()}` } });
    await client.user.create({ data: userData(department.id) });

    const error = await captureError(
      runWithDbErrors({ operation: 'delete' }, () => client.department.delete({ where: { id: department.id } })),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toBe('No se puede eliminar porque tiene registros asociados.');
    expect(await client.department.count({ where: { id: department.id } })).toBe(1);
  });

  it('P2025 al editar o eliminar un registro inexistente da 404', async () => {
    const onUpdate = await captureError(
      runWithDbErrors({ operation: 'update' }, () =>
        client.department.update({ where: { id: 999_999 }, data: { name: 'No existe' } }),
      ),
    );
    expect(onUpdate).toBeInstanceOf(NotFoundError);

    const onDelete = await captureError(
      runWithDbErrors({ operation: 'delete' }, () => client.department.delete({ where: { id: 999_999 } })),
    );
    expect(onDelete).toBeInstanceOf(NotFoundError);
  });

  it('la respuesta al cliente nunca incluye el mensaje técnico de Prisma', async () => {
    const department = await client.department.create({ data: { name: `Fuga ${next()}` } });
    const existing = await client.user.create({ data: userData(department.id) });

    const raw = [
      await captureError(client.user.create({ data: { ...userData(department.id), internalId: existing.internalId } })),
      await captureError(client.user.create({ data: userData(999_999) })),
      await captureError(client.department.delete({ where: { id: department.id } })),
      await captureError(client.department.delete({ where: { id: 999_999 } })),
    ];
    // Los errores reales sí contienen detalles técnicos...
    expect(raw.every((e) => e instanceof Error && e.name === 'PrismaClientKnownRequestError')).toBe(true);

    // ...pero ninguna respuesta los expone.
    for (const error of raw) {
      const { body } = toErrorResponse(error);
      const text = JSON.stringify(body);
      for (const fragment of ['prisma', 'Prisma', 'P20', 'constraint', 'invocation', 'SQLITE', 'User_', 'C:\\', existing.internalId]) {
        expect(text).not.toContain(fragment);
      }
    }
    // Sin contexto, P2003 no se adivina: queda como 500 genérico.
    expect(toErrorResponse(raw[1]).status).toBe(500);
  });
});
