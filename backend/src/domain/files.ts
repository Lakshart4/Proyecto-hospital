// Reglas puras de archivos y fechas de documentos (Req. 5.13, 5.14, 19.1, 19.3).
//
// `validateUpload` acepta una foto de Perfil solo si el tipo declarado es JPEG o PNG, pesa hasta 2 MB y
// su firma coincide con el tipo declarado; acepta un Documento_de_Empleado solo si es PDF por firma y
// pesa hasta 5 MB (el tipo declarado no cuenta). `validateDocumentDates` exige una emisión no posterior
// a `today` (instante actual) y un vencimiento, si existe, no anterior a la emisión.
// Ambas devuelven errores por campo; una lista vacía significa que el dato es válido.

import type { FieldError } from '../lib/errors';
import { detectFileType, type DetectedFileType } from '../lib/file-signature';

const MB = 1024 * 1024;
export const MAX_PHOTO_BYTES = 2 * MB;
export const MAX_PDF_BYTES = 5 * MB;

/** Tipos MIME declarables para una foto y el formato que debe confirmar la firma. */
const PHOTO_TYPES: Readonly<Record<string, DetectedFileType>> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
};

export const FILE_MESSAGES = {
  photoType: 'La foto debe ser una imagen JPEG o PNG.',
  photoSize: 'La foto no puede superar 2 MB.',
  photoSignature: 'El contenido de la foto no coincide con el formato declarado.',
  pdfType: 'El documento debe ser un archivo PDF.',
  pdfSize: 'El documento no puede superar 5 MB.',
  empty: 'El archivo está vacío.',
  issuedInFuture: 'La fecha de emisión no puede ser posterior a hoy.',
  expiresBeforeIssued: 'La fecha de vencimiento no puede ser anterior a la de emisión.',
  invalidDate: 'La fecha no es válida.',
} as const;

export interface UploadInfo {
  size: number;
  declaredType: string;
  /** Primeros bytes del archivo. */
  head: Uint8Array;
}

export function validateUpload(kind: 'photo' | 'pdf', f: UploadInfo): FieldError[] {
  const errors: FieldError[] = [];
  const add = (message: string) => errors.push({ field: 'file', message });
  if (!Number.isSafeInteger(f.size) || f.size <= 0) {
    add(FILE_MESSAGES.empty);
    return errors;
  }
  const detected = detectFileType(f.head);

  if (kind === 'photo') {
    const expected = PHOTO_TYPES[f.declaredType.trim().toLowerCase()];
    if (!expected) add(FILE_MESSAGES.photoType);
    else if (detected !== expected) add(FILE_MESSAGES.photoSignature);
    if (f.size > MAX_PHOTO_BYTES) add(FILE_MESSAGES.photoSize);
  } else {
    if (detected !== 'pdf') add(FILE_MESSAGES.pdfType);
    if (f.size > MAX_PDF_BYTES) add(FILE_MESSAGES.pdfSize);
  }
  return errors;
}

const isValidDate = (value: unknown): value is Date => value instanceof Date && !Number.isNaN(value.getTime());

export function validateDocumentDates(issuedAt: Date, expiresAt: Date | null, today: Date): FieldError[] {
  if (!isValidDate(today)) throw new RangeError('today no es una fecha válida.');
  const errors: FieldError[] = [];
  if (!isValidDate(issuedAt)) errors.push({ field: 'issuedAt', message: FILE_MESSAGES.invalidDate });
  else if (issuedAt.getTime() > today.getTime()) errors.push({ field: 'issuedAt', message: FILE_MESSAGES.issuedInFuture });

  if (expiresAt !== null) {
    if (!isValidDate(expiresAt)) errors.push({ field: 'expiresAt', message: FILE_MESSAGES.invalidDate });
    else if (isValidDate(issuedAt) && expiresAt.getTime() < issuedAt.getTime()) {
      errors.push({ field: 'expiresAt', message: FILE_MESSAGES.expiresBeforeIssued });
    }
  }
  return errors;
}

const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/** Verdadero si `expiresAt` existe y su fecha es anterior a la fecha actual (Req. 19.9). */
export function isDocumentExpired(expiresAt: Date | null, today: Date): boolean {
  if (expiresAt === null) return false;
  return toDateOnly(expiresAt) < toDateOnly(today);
}

export interface EmployeeDocumentRow {
  id: number;
  userId: number;
  type: string;
  title: string;
  issuedAt: Date;
  expiresAt: Date | null;
  fileSize: number;
  createdAt: Date;
  updatedAt: Date;
}

export function toEmployeeDocumentDto(row: EmployeeDocumentRow, today: Date) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    issuedAt: toDateOnly(row.issuedAt),
    expiresAt: row.expiresAt === null ? null : toDateOnly(row.expiresAt),
    fileSize: row.fileSize,
    expired: isDocumentExpired(row.expiresAt, today),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type EmployeeDocumentDto = ReturnType<typeof toEmployeeDocumentDto>;
