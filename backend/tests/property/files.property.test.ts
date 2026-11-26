// Prueba de propiedades de validación de archivos y fechas de documentos (tarea 3.23, Property 26).
//
// Se generan archivos con firmas JPEG, PNG y PDF (completas, truncadas o ausentes), tipos declarados
// válidos e inválidos (incluidas variantes de mayúsculas y espacios, que se normalizan según la
// decisión de la tarea 3.21) y tamaños en los límites exactos (0, 1, 2 MB y 5 MB y ±1 byte). Para las
// fechas se generan emisión, vencimiento opcional y `today` con diferencias de -1, 0 y +1 ms y fechas
// inválidas. El oráculo compara las firmas como texto hexadecimal y aplica la definición de Property 26.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FILE_MESSAGES, validateDocumentDates, validateUpload } from '../../src/domain/files';
import { detectFileType } from '../../src/lib/file-signature';

const RUNS = { numRuns: 100 };
const MB = 1024 * 1024;
const PHOTO_MAX = 2 * MB;
const PDF_MAX = 5 * MB;

// ---------- Oráculo ----------

const SIGNATURE_HEX = { jpeg: 'ffd8ff', png: '89504e470d0a1a0a', pdf: '255044462d' } as const;
type Kind = keyof typeof SIGNATURE_HEX;
const hexOf = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const signatureOf = (head: Uint8Array): Kind | null =>
  (Object.keys(SIGNATURE_HEX) as Kind[]).find((k) => hexOf(head).startsWith(SIGNATURE_HEX[k])) ?? null;

function expectedUploadMessages(kind: 'photo' | 'pdf', size: number, declaredType: string, head: Uint8Array): string[] {
  if (size <= 0) return [FILE_MESSAGES.empty];
  const sig = signatureOf(head);
  const messages: string[] = [];
  if (kind === 'photo') {
    const declared = declaredType.trim().toLowerCase();
    const want = declared === 'image/jpeg' ? 'jpeg' : declared === 'image/png' ? 'png' : null;
    if (want === null) messages.push(FILE_MESSAGES.photoType);
    else if (sig !== want) messages.push(FILE_MESSAGES.photoSignature);
    if (size > PHOTO_MAX) messages.push(FILE_MESSAGES.photoSize);
  } else {
    if (sig !== 'pdf') messages.push(FILE_MESSAGES.pdfType);
    if (size > PDF_MAX) messages.push(FILE_MESSAGES.pdfSize);
  }
  return messages;
}

// ---------- Generadores ----------

const bytesOfHex = (hex: string) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));

const headArb: fc.Arbitrary<Uint8Array> = fc.oneof(
  // Firma completa seguida de bytes cualesquiera.
  fc.tuple(fc.constantFrom<Kind>('jpeg', 'png', 'pdf'), fc.uint8Array({ maxLength: 8 })).map(([k, tail]) => Uint8Array.from([...bytesOfHex(SIGNATURE_HEX[k]), ...tail])),
  // Firma truncada (le falta el último byte).
  fc.constantFrom<Kind>('jpeg', 'png', 'pdf').map((k) => bytesOfHex(SIGNATURE_HEX[k]).slice(0, -1)),
  // Bytes al azar o vacío.
  fc.uint8Array({ maxLength: 12 }),
);

const sizeArb = fc.oneof(
  fc.constantFrom(0, 1, PHOTO_MAX - 1, PHOTO_MAX, PHOTO_MAX + 1, PDF_MAX - 1, PDF_MAX, PDF_MAX + 1),
  fc.integer({ min: 1, max: 6 * MB }),
);

const declaredArb = fc.constantFrom('image/jpeg', 'image/png', 'IMAGE/PNG', ' image/jpeg ', 'image/gif', 'image/jpg', 'application/pdf', '');

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 2, 10, 15, 30);
const offsetArb = fc.oneof(fc.constantFrom(-1, 0, 1), fc.integer({ min: -400 * DAY, max: 400 * DAY }));
const maybeInvalid = (time: number, invalid: boolean) => (invalid ? new Date(Number.NaN) : new Date(time));

const datesArb = fc
  .record({
    issuedOffset: offsetArb,
    hasExpiry: fc.boolean(),
    expiryDelta: fc.oneof(fc.constantFrom(-1, 0, 1), fc.integer({ min: -400 * DAY, max: 400 * DAY })),
    // Fecha inválida en 1 de cada 10 casos.
    invalidIssued: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
    invalidExpiry: fc.integer({ min: 0, max: 9 }).map((n) => n === 0),
  })
  .map(({ issuedOffset, hasExpiry, expiryDelta, invalidIssued, invalidExpiry }) => {
    const today = new Date(BASE);
    const issuedTime = BASE + issuedOffset;
    return {
      today,
      issuedAt: maybeInvalid(issuedTime, invalidIssued),
      expiresAt: hasExpiry ? maybeInvalid(issuedTime + expiryDelta, invalidExpiry) : null,
    };
  });

const scenarioArb = fc.record({
  kind: fc.constantFrom<'photo' | 'pdf'>('photo', 'pdf'),
  size: sizeArb,
  declaredType: declaredArb,
  head: headArb,
  dates: datesArb,
});

describe('Archivos y fechas de documentos (propiedades)', () => {
  // Feature: hospital-management-system, Property 26: Validación de archivos y fechas de documentos
  it('Property 26: validateUpload acepta solo fotos JPEG/PNG coincidentes ≤ 2 MB y PDF por firma ≤ 5 MB; validateDocumentDates exige emisión ≤ hoy y vencimiento ≥ emisión', () => {
    fc.assert(
      fc.property(scenarioArb, ({ kind, size, declaredType, head, dates }) => {
        // Firma.
        const headCopy = Uint8Array.from(head);
        expect(detectFileType(head)).toBe(signatureOf(head));

        // Archivo: aceptado si y solo si la lista está vacía; todos los errores en el campo "file".
        const errors = validateUpload(kind, { size, declaredType, head });
        expect(errors.map((e) => e.message)).toEqual(expectedUploadMessages(kind, size, declaredType, head));
        expect(errors.every((e) => e.field === 'file')).toBe(true);
        expect(head).toEqual(headCopy);

        // Fechas.
        const { issuedAt, expiresAt, today } = dates;
        const times = [issuedAt.getTime(), expiresAt?.getTime(), today.getTime()];
        const issuedValid = !Number.isNaN(issuedAt.getTime());
        const expectedFields: string[] = [];
        if (!issuedValid || issuedAt.getTime() > today.getTime()) expectedFields.push('issuedAt');
        if (expiresAt !== null) {
          const expiresValid = !Number.isNaN(expiresAt.getTime());
          if (!expiresValid || (issuedValid && expiresAt.getTime() < issuedAt.getTime())) expectedFields.push('expiresAt');
        }
        expect(validateDocumentDates(issuedAt, expiresAt, today).map((e) => e.field)).toEqual(expectedFields);
        expect([issuedAt.getTime(), expiresAt?.getTime(), today.getTime()]).toEqual(times);
      }),
      RUNS,
    );
  });
});
