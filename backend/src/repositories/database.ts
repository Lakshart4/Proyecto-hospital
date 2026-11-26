// Ciclo de vida de la conexión a la base de datos, para el arranque y apagado del servidor.
// server.ts lo usa desde aquí para no importar el cliente Prisma fuera de la capa de acceso a datos.
// `Database` es el tipo del cliente que reciben los servicios (inyectable para pruebas con SQLite
// temporal); `defaultDatabase` es la instancia compartida que usa DATABASE_URL.

export type { PrismaClient as Database } from '@prisma/client';
export { disconnectPrisma as disconnectDatabase, prisma as defaultDatabase } from '../lib/prisma';
