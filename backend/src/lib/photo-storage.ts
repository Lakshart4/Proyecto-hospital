// Almacenamiento de fotos de Perfil en disco (Req. 5.13, 5.14). Carpeta por defecto: backend/uploads/photos.
//
// Los archivos se guardan con un nombre aleatorio (UUID) y la extensión que confirma la firma del archivo,
// nunca con el nombre que envía el cliente. Solo se leen y borran nombres con ese formato exacto y siempre
// dentro de la carpeta, así que una ruta con `..`, separadores u otra extensión nunca llega al disco.

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { isValidPhotoFilename } from '../domain/staff';

export type PhotoExtension = 'jpg' | 'png';

export const DEFAULT_PHOTOS_DIR = join(__dirname, '..', '..', 'uploads', 'photos');

export interface PhotoStorage {
  /** Guarda la foto con un nombre nuevo y devuelve ese nombre. */
  save(content: Uint8Array, extension: PhotoExtension): Promise<string>;
  /** Borra la foto; ignora nombres inválidos y archivos inexistentes. */
  remove(filename: string): Promise<void>;
  /** Contenido de la foto, o null si el nombre no es válido o el archivo no existe. */
  read(filename: string): Promise<Uint8Array | null>;
}

export function createPhotoStorage(directory: string = DEFAULT_PHOTOS_DIR): PhotoStorage {
  const root = resolve(directory);

  /** Ruta absoluta dentro de la carpeta, o null si el nombre no es una foto válida. */
  const pathOf = (filename: string): string | null => {
    if (!isValidPhotoFilename(filename)) return null;
    const path = resolve(root, filename);
    return path.startsWith(root + sep) ? path : null;
  };

  return {
    async save(content, extension) {
      await mkdir(root, { recursive: true });
      const filename = `${randomUUID()}.${extension}`;
      const path = pathOf(filename);
      if (path === null) throw new Error('Nombre de foto inválido.');
      await writeFile(path, content, { flag: 'wx' });
      return filename;
    },

    async remove(filename) {
      const path = pathOf(filename);
      if (path === null) return;
      await rm(path, { force: true });
    },

    async read(filename) {
      const path = pathOf(filename);
      if (path === null) return null;
      try {
        return await readFile(path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
  };
}
