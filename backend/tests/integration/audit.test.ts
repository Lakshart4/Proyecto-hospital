// Pruebas de integración del escritor de auditoría (tarea 4.17; Req. 12.1, 12.2, 12.6, 12.8).
// Usan una base SQLite temporal con las migraciones reales y transacciones reales (`withTransaction`),
// sin simulaciones. Los valores secretos se generan en cada ejecución.

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InternalError } from '../../src/lib/errors';
import { AUDIT_FAILURE_MESSAGE, writeAudit, type AuditEntry } from '../../src/repositories/audit.repository';
import { withTransaction } from '../../src/repositories/transaction';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

let db: TempDatabase | undefined;
const client = () => (db as TempDatabase).client;
const secret = () => randomBytes(16).toString('hex');

beforeAll(() => {
  db = createTempDatabase('hm-audit-');
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

beforeEach(async () => {
  await client().auditLog.deleteMany();
  await client().department.deleteMany();
});

describe('writeAudit', () => {
  it('guarda el registro junto con la operación y sanea los detalles', async () => {
    const leaked = secret();
    await withTransaction(
      async (tx) => {
        const department = await tx.department.create({ data: { name: 'Auditoría A' } });
        await writeAudit(tx, {
          userId: null,
          action: 'LOGIN_FAILURE',
          entityType: 'User',
          entityId: department.id,
          details: { email: 'x@example.com', password: leaked, nested: { resetToken: leaked, keep: 1 }, list: [{ sid: leaked, ok: true }] },
        });
      },
      { client: client() },
    );

    expect(await client().department.count()).toBe(1);
    const logs = await client().auditLog.findMany();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ userId: null, action: 'LOGIN_FAILURE', entityType: 'User' });
    expect(JSON.parse(logs[0]!.details)).toEqual({ email: 'x@example.com', nested: { keep: 1 }, list: [{ ok: true }] });
    expect(logs[0]!.details).not.toContain(leaked);
  });

  it('si la operación falla después de auditar, se revierten ambas: no quedan registros huérfanos', async () => {
    await expect(
      withTransaction(
        async (tx) => {
          await tx.department.create({ data: { name: 'Auditoría B' } });
          await writeAudit(tx, { userId: null, action: 'PASSWORD_CHANGE', entityType: 'User' });
          throw new Error('Fallo forzado de la operación');
        },
        { client: client() },
      ),
    ).rejects.toThrow('Fallo forzado de la operación');

    expect(await client().department.count()).toBe(0);
    expect(await client().auditLog.count()).toBe(0);
  });

  it('si la auditoría falla, responde 500 "La operación no se completó." y revierte la operación', async () => {
    // userId inexistente: la base rechaza la clave foránea (fallo real de escritura).
    const attempt = withTransaction(
      async (tx) => {
        await tx.department.create({ data: { name: 'Auditoría C' } });
        await writeAudit(tx, { userId: 999_999, action: 'EMPLOYEE_CREATE', entityType: 'Employee' });
      },
      { client: client() },
    );
    await expect(attempt).rejects.toBeInstanceOf(InternalError);
    await attempt.catch((error: InternalError) => {
      expect(error.status).toBe(500);
      expect(error.message).toBe(AUDIT_FAILURE_MESSAGE);
    });

    expect(await client().department.count()).toBe(0);
    expect(await client().auditLog.count()).toBe(0);
  });

  it('rechaza acciones o tipos de entidad fuera de la lista del Req. 12.2 sin escribir nada', async () => {
    for (const entry of [
      { userId: null, action: 'USER_DELETE_ALL', entityType: 'User' },
      { userId: null, action: 'LOGIN_SUCCESS', entityType: 'Cualquiera' },
    ] as unknown as AuditEntry[]) {
      await expect(
        withTransaction(
          async (tx) => {
            await tx.department.create({ data: { name: `Auditoría ${entry.action}` } });
            await writeAudit(tx, entry);
          },
          { client: client() },
        ),
      ).rejects.toThrow(AUDIT_FAILURE_MESSAGE);
    }
    expect(await client().department.count()).toBe(0);
    expect(await client().auditLog.count()).toBe(0);
  });
});
