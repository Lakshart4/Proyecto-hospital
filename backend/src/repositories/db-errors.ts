// Ayudante de los repositorios para traducir errores de Prisma según la operación.
// Ejemplo: `runWithDbErrors({ operation: 'delete' }, () => tx.room.delete({ where: { id } }))`
// convierte un P2003 en 409 (tiene registros asociados) en lugar de 400.

import { translatePrismaError, type DbErrorContext } from '../lib/errors';

/**
 * Ejecuta una operación de base de datos y traduce sus errores conocidos de Prisma
 * con el contexto indicado. Los demás errores se vuelven a lanzar sin cambios.
 */
export async function runWithDbErrors<T>(context: DbErrorContext, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw translatePrismaError(error, context) ?? error;
  }
}
