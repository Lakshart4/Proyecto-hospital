// Transacciones de la capa de acceso a datos (Req. 12.1, 12.8, 14.9, 25.7).
// Los servicios agrupan operaciones relacionadas con `withTransaction`: si cualquier paso
// lanza un error, Prisma revierte todos los cambios de esa transacción y el error se
// vuelve a lanzar sin modificar.

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Cliente que reciben las funciones de repositorio dentro de una transacción. */
export type DbClient = Prisma.TransactionClient;

export interface TransactionOptions {
  /** Cliente a usar; por defecto la instancia compartida. Las pruebas pasan uno con una base temporal. */
  client?: PrismaClient;
  /** Tiempo máximo de la transacción en milisegundos (por defecto 10 000). */
  timeoutMs?: number;
  /** Tiempo máximo de espera para iniciarla en milisegundos (por defecto 5 000). */
  maxWaitMs?: number;
}

export const DEFAULT_TRANSACTION_TIMEOUT_MS = 10_000;
export const DEFAULT_TRANSACTION_MAX_WAIT_MS = 5_000;

/**
 * Ejecuta `work` dentro de una transacción interactiva.
 * Confirma los cambios si `work` termina bien; los revierte todos si lanza un error.
 */
export function withTransaction<T>(work: (tx: DbClient) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
  const client = options.client ?? prisma;
  return client.$transaction((tx) => work(tx), {
    timeout: options.timeoutMs ?? DEFAULT_TRANSACTION_TIMEOUT_MS,
    maxWait: options.maxWaitMs ?? DEFAULT_TRANSACTION_MAX_WAIT_MS,
  });
}
