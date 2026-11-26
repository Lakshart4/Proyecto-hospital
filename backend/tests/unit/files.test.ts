// Pruebas de firmas de archivo, validateUpload y validateDocumentDates (tarea 3.21, Req. 5.13, 5.14, 19.1, 19.3).
// La propiedad 26 corresponde a la tarea 3.23.

import { describe, expect, it } from 'vitest';
import { FILE_MESSAGES, MAX_PDF_BYTES, MAX_PHOTO_BYTES, validateDocumentDates, validateUpload } from '../../src/domain/files';
import { SIGNATURE_BYTES, detectFileType } from '../../src/lib/file-signature';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = new TextEncoder().encode('%PDF-1.7');
const TEXT = new TextEncoder().encode('hola mundo');
const messages = (errors: { message: string }[]) => errors.map((e) => e.message);

describe('detectFileType', () => {
  it('reconoce JPEG, PNG y PDF por sus primeros bytes', () => {
    expect(detectFileType(JPEG)).toBe('jpeg');
    expect(detectFileType(PNG)).toBe('png');
    expect(detectFileType(PDF)).toBe('pdf');
    expect(detectFileType(TEXT)).toBeNull();
    expect(detectFileType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(SIGNATURE_BYTES).toBe(8);
  });
});

describe('validateUpload: foto', () => {
  it('acepta JPEG y PNG con firma coincidente de hasta 2 MB', () => {
    expect(validateUpload('photo', { size: 1000, declaredType: 'image/jpeg', head: JPEG })).toEqual([]);
    expect(validateUpload('photo', { size: MAX_PHOTO_BYTES, declaredType: 'image/png', head: PNG })).toEqual([]);
  });

  it('rechaza una foto de más de 2 MB', () => {
    expect(messages(validateUpload('photo', { size: MAX_PHOTO_BYTES + 1, declaredType: 'image/png', head: PNG }))).toEqual([FILE_MESSAGES.photoSize]);
  });

  it('rechaza un tipo declarado distinto de JPEG o PNG', () => {
    expect(messages(validateUpload('photo', { size: 1000, declaredType: 'image/gif', head: JPEG }))).toEqual([FILE_MESSAGES.photoType]);
  });

  it('rechaza una firma que no coincide con el formato declarado', () => {
    expect(messages(validateUpload('photo', { size: 1000, declaredType: 'image/jpeg', head: PNG }))).toEqual([FILE_MESSAGES.photoSignature]);
    expect(messages(validateUpload('photo', { size: 1000, declaredType: 'image/png', head: TEXT }))).toEqual([FILE_MESSAGES.photoSignature]);
  });

  it('informa el campo file', () => {
    expect(validateUpload('photo', { size: 1000, declaredType: 'image/gif', head: JPEG }).map((e) => e.field)).toEqual(['file']);
  });
});

describe('validateUpload: PDF', () => {
  it('acepta un PDF por firma de hasta 5 MB, sin importar el tipo declarado', () => {
    expect(validateUpload('pdf', { size: MAX_PDF_BYTES, declaredType: 'application/pdf', head: PDF })).toEqual([]);
    expect(validateUpload('pdf', { size: 1000, declaredType: 'application/octet-stream', head: PDF })).toEqual([]);
  });

  it('rechaza un archivo declarado como PDF con otra firma', () => {
    expect(messages(validateUpload('pdf', { size: 1000, declaredType: 'application/pdf', head: JPEG }))).toEqual([FILE_MESSAGES.pdfType]);
  });

  it('rechaza un PDF de más de 5 MB', () => {
    expect(messages(validateUpload('pdf', { size: MAX_PDF_BYTES + 1, declaredType: 'application/pdf', head: PDF }))).toEqual([FILE_MESSAGES.pdfSize]);
  });

  it('rechaza un archivo vacío', () => {
    expect(messages(validateUpload('pdf', { size: 0, declaredType: 'application/pdf', head: new Uint8Array() }))).toEqual([FILE_MESSAGES.empty]);
  });
});

describe('validateDocumentDates', () => {
  const today = new Date('2026-03-10T15:30:00Z');
  const fields = (issued: Date, expires: Date | null) => validateDocumentDates(issued, expires, today).map((e) => e.field);

  it('acepta una emisión hasta hoy y un vencimiento ausente o no anterior a la emisión', () => {
    expect(fields(today, null)).toEqual([]);
    expect(fields(new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'))).toEqual([]);
    expect(fields(new Date('2025-01-01T00:00:00Z'), new Date('2027-01-01T00:00:00Z'))).toEqual([]);
  });

  it('rechaza una emisión posterior a hoy', () => {
    expect(fields(new Date(today.getTime() + 1), null)).toEqual(['issuedAt']);
  });

  it('rechaza un vencimiento anterior a la emisión', () => {
    expect(fields(new Date('2025-01-02T00:00:00Z'), new Date('2025-01-01T23:59:59Z'))).toEqual(['expiresAt']);
  });

  it('informa las fechas inválidas en su campo', () => {
    expect(fields(new Date('x'), new Date('y'))).toEqual(['issuedAt', 'expiresAt']);
    expect(() => validateDocumentDates(today, null, new Date('x'))).toThrow(RangeError);
  });
});
