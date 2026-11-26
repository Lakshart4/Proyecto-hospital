// Escritor de la Bitácora_de_Auditoría (Req. 12.1, 12.2, 12.6, 12.8, 17.9, 18.2).
//
// `writeAudit` recibe el cliente de la transacción de la operación auditada (`withTransaction`), así que
// el registro y la operación se confirman o se revierten juntos. Los detalles pasan siempre por
// `sanitizeAuditDetails`. Si el registro no se puede guardar, lanza un error 500 con el mensaje
// "La operación no se completó."; al salir de `withTransaction`, Prisma revierte también la operación.

import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, type AuditAction, type AuditEntityType } from '../domain/constants';
import { sanitizeAuditDetails } from '../domain/others';
import { InternalError } from '../lib/errors';
import type { Database } from './database';
import type { DbClient } from './transaction';

export const AUDIT_FAILURE_MESSAGE = 'La operación no se completó.';

export const AUDIT_LOG_SELECT = {
  id: true,
  userId: true,
  user: { select: { id: true, internalId: true, name: true } },
  action: true,
  entityType: true,
  entityId: true,
  details: true,
  createdAt: true,
} as const;

/** Consulta descendente; el id desempata registros creados en el mismo instante. */
export async function listAuditLogs(db: Database) {
  return db.auditLog.findMany({
    select: AUDIT_LOG_SELECT,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}

export interface AuditEntry {
  /** null si la acción no corresponde a una cuenta identificable (por ejemplo, un inicio de sesión fallido). */
  userId: number | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: number | null;
  details?: Readonly<Record<string, unknown>>;
}

/**
 * Guarda un registro de auditoría dentro de la transacción `tx`.
 * @throws InternalError (500, "La operación no se completó.") si la acción o el tipo de entidad no están
 * en las listas del Req. 12.2 o si la escritura falla; la transacción se revierte completa.
 */
export async function writeAudit(tx: DbClient, entry: AuditEntry): Promise<void> {
  if (!(AUDIT_ACTIONS as readonly string[]).includes(entry.action) || !(AUDIT_ENTITY_TYPES as readonly string[]).includes(entry.entityType)) {
    throw new InternalError(AUDIT_FAILURE_MESSAGE);
  }
  try {
    await tx.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        details: JSON.stringify(sanitizeAuditDetails(entry.details ?? {})),
      },
    });
  } catch {
    throw new InternalError(AUDIT_FAILURE_MESSAGE);
  }
}
