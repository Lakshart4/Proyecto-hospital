// Comando de semilla: `npm run seed` (tsx prisma/seed.ts).
// Lee backend/.env con loadEnv (exige las variables obligatorias), ejecuta la semilla en una
// transacción y, solo si termina bien, muestra los conteos y la tabla de credenciales demo.
// Si falla, no se guarda ningún cambio, se muestra la causa y el proceso termina con código 1.

import { loadDotEnvFile, loadEnvOrExit } from '../src/config/env';
import { disconnectPrisma } from '../src/lib/prisma';
import { DEMO_PASSWORD_VARIABLES, countSeedData, formatCredentialsTable, runSeed } from './seed/run-seed';

async function main(): Promise<void> {
  loadDotEnvFile();
  const { config } = loadEnvOrExit(process.env);

  const unknown = Object.keys(config.demoPasswords).filter((name) => !DEMO_PASSWORD_VARIABLES.includes(name));
  if (unknown.length > 0) {
    console.warn(`Aviso: estas variables no corresponden a ninguna cuenta demo y se ignoran: ${unknown.join(', ')}.`);
  }

  console.log('Ejecutando la semilla de datos demo...');
  const result = await runSeed({ demoPasswords: config.demoPasswords });
  const counts = await countSeedData();

  console.log(`Semilla completada. Fecha de referencia de los datos: ${result.referenceDate.toISOString()}.`);
  console.log(`PDF creados en esta ejecución: ${result.createdFiles.length}.`);
  console.log('Registros en la base de datos:');
  for (const [model, count] of Object.entries(counts)) console.log(`  ${model}: ${count}`);
  console.log('');
  console.log(formatCredentialsTable(result.credentials));
}

main()
  .then(() => disconnectPrisma())
  .catch(async (error: unknown) => {
    const cause = error instanceof Error ? error.message : String(error);
    console.error('La semilla falló y no se guardó ningún cambio en la base de datos.');
    console.error(`Causa: ${cause}`);
    await disconnectPrisma();
    process.exitCode = 1;
  });
