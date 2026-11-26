// Punto de entrada del Backend.
// Carga y valida las variables de entorno (termina con código 1 si falta una obligatoria),
// inicia el servidor HTTP en PORT (3000 por defecto) y lo cierra de forma ordenada con SIGINT o
// SIGTERM, desconectando la base de datos. No imprime secretos.

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from './app';
import { loadDotEnvFile, loadEnvOrExit, type AppConfig } from './config/env';
import { createMailService } from './mail/mail.service';
import { disconnectDatabase } from './repositories/database';

const FORCE_CLOSE_AFTER_MS = 10_000;

export interface RunningServer {
  server: Server;
  port: number;
  /** Deja de aceptar conexiones, espera a las activas (máximo 10 s) y desconecta la base de datos. */
  close: () => Promise<void>;
}

export interface StartServerOptions {
  logError?: (message: string) => void;
  /** Por defecto, la desconexión del cliente Prisma compartido. */
  disconnect?: () => Promise<void>;
}

export function startServer(config: AppConfig, options: StartServerOptions = {}): Promise<RunningServer> {
  const app = createApp({
    corsOrigin: config.corsOrigin,
    sessionSecret: config.sessionSecret,
    secureCookies: config.nodeEnv === 'production',
    mail: createMailService({ nodeEnv: config.nodeEnv, smtp: config.smtp }),
    frontendUrl: config.frontendUrl,
    ...(options.logError ? { logError: options.logError } : {}),
  });
  const server = createServer(app);
  const disconnect = options.disconnect ?? disconnectDatabase;

  const close = () =>
    new Promise<void>((resolve, reject) => {
      const forceTimer = setTimeout(() => server.closeAllConnections(), FORCE_CLOSE_AFTER_MS);
      forceTimer.unref();
      server.close((closeError) => {
        clearTimeout(forceTimer);
        disconnect().then(
          () => (closeError ? reject(closeError) : resolve()),
          (disconnectError: unknown) => reject(closeError ?? disconnectError),
        );
      });
      server.closeIdleConnections();
    });

  return new Promise((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      const reason = error.code === 'EADDRINUSE' ? 'el puerto ya está en uso' : error.message;
      reject(new Error(`No se pudo iniciar el servidor en el puerto ${config.port}: ${reason}.`));
    };
    server.once('error', onError);
    server.listen(config.port, () => {
      server.off('error', onError);
      const { port } = server.address() as AddressInfo;
      resolve({ server, port, close });
    });
  });
}

async function main(): Promise<void> {
  loadDotEnvFile();
  const { config, warnings } = loadEnvOrExit(process.env);
  for (const warning of warnings) console.warn(`Aviso: ${warning}`);

  let running: RunningServer;
  try {
    running = await startServer(config);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Backend escuchando en http://localhost:${running.port} ` +
      `(entorno=${config.nodeEnv}, origen CORS=${config.corsOrigin}, correo=${config.smtp ? 'SMTP' : 'Bandeja_Local'}).`,
  );

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`Señal ${signal} recibida. Cerrando el servidor...`);
    running.close().then(
      () => {
        console.log('Servidor detenido.');
        process.exit(0);
      },
      (error: unknown) => {
        console.error(`Error al cerrar el servidor: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      },
    );
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  void main();
}
