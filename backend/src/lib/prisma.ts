// Cliente Prisma del Backend (infraestructura de la capa de acceso a datos).
// Solo este archivo y la carpeta repositories/ pueden importar @prisma/client (Req. 16.2).
// Las rutas, los controladores y los servicios nunca lo importan.

import { PrismaClient } from '@prisma/client';

/**
 * Crea un cliente Prisma con la configuración del proyecto.
 * Úsalo solo cuando haga falta una base distinta de DATABASE_URL (pruebas con SQLite
 * temporal o scripts). El resto del código usa la instancia compartida `prisma`.
 */
export function createPrismaClient(databaseUrl?: string): PrismaClient {
  return new PrismaClient({
    // Mensajes de error sin fragmentos de código ni rutas de archivos.
    errorFormat: 'minimal',
    ...(databaseUrl ? { datasourceUrl: databaseUrl } : {}),
  });
}

/**
 * Instancia única compartida por todo el Backend. Se conecta en la primera consulta
 * usando DATABASE_URL, así que importarla no abre ninguna conexión.
 */
export const prisma: PrismaClient = createPrismaClient();

/** Cierra la conexión de la instancia compartida (apagado del servidor o fin de scripts). */
export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
