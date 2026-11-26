// Almacenamiento privado de Documentos_de_Empleado en backend/storage/documents (Req. 19.1, 19.6, 19.8).
//
// Los archivos nuevos se guardan como `<uuid>.pdf`. Las rutas guardadas en la base son relativas a
// storage/documents y usan "/" (por ejemplo `seed/EMP-001-contratacion.pdf` o `<uuid>.pdf`).
// Cualquier ruta que salga de la carpeta (absoluta, con `..`, `\`, carácter nulo o sin extensión .pdf)
// se rechaza/ignora sin tocar el disco.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, resolve, sep } from 'node:path';

export const DEFAULT_DOCUMENTS_DIR = join(__dirname, '..', '..', 'storage', 'documents');

export interface DocumentFiles {
  /** Guarda un PDF con nombre UUID nuevo y devuelve la ruta relativa. */
  save(content: Uint8Array): Promise<string>;
  /** Lee el contenido de un PDF por su ruta relativa, o null si no es válida o no existe. */
  read(relativePath: string): Promise<Uint8Array | null>;
  /** Borra un archivo por su ruta relativa (ignora rutas inválidas o inexistentes). */
  remove(relativePath: string): Promise<void>;
  /** Borra los archivos indicados (rutas relativas a la carpeta). Devuelve cuántos se intentó borrar. */
  removeAll(relativePaths: readonly string[]): Promise<number>;
}

export function createDocumentFiles(directory: string = DEFAULT_DOCUMENTS_DIR): DocumentFiles {
  const root = resolve(directory);

  const pathOf = (relativePath: string): string | null => {
    if (
      relativePath === '' ||
      relativePath.includes('\0') ||
      relativePath.includes('\\') ||
      isAbsolute(relativePath) ||
      !relativePath.toLowerCase().endsWith('.pdf')
    ) {
      return null;
    }
    const path = resolve(root, ...relativePath.split('/'));
    return path.startsWith(root + sep) ? path : null;
  };

  return {
    async save(content) {
      await mkdir(root, { recursive: true });
      const relativePath = `${randomUUID()}.pdf`;
      const path = pathOf(relativePath);
      if (path === null) throw new Error('Nombre de documento inválido.');
      await writeFile(path, content, { flag: 'wx' });
      return relativePath;
    },

    async read(relativePath) {
      const path = pathOf(relativePath);
      if (path === null) return null;
      try {
        return await readFile(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },

    async remove(relativePath) {
      const path = pathOf(relativePath);
      if (path === null) return;
      try {
        await rm(path, { force: true });
      } catch {
        // Mejor esfuerzo.
      }
    },

    async removeAll(relativePaths) {
      let attempted = 0;
      for (const relativePath of relativePaths) {
        const path = pathOf(relativePath);
        if (path === null) continue;
        attempted += 1;
        try {
          await rm(path, { force: true });
        } catch {
          // Mejor esfuerzo: la fila ya se eliminó de la base de datos.
        }
      }
      return attempted;
    },
  };
}
