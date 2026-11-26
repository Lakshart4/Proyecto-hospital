// Copia el artefacto Vite sin borrar nada de backend/public ni de los directorios de datos.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryDir = resolve(backendDir, '..');
const source = resolve(repositoryDir, 'frontend', 'dist');
const destination = resolve(backendDir, 'public');
const indexHtml = resolve(source, 'index.html');

if (!existsSync(indexHtml)) {
  throw new Error(`No existe ${indexHtml}. Compila primero el Frontend con Vite.`);
}
mkdirSync(destination, { recursive: true });
cpSync(source, destination, { recursive: true, force: true });
console.log(`Frontend copiado a ${destination}`);
