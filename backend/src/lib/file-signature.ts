// Detección del tipo de archivo por su firma (primeros bytes), sin confiar en la extensión ni en el
// tipo declarado por el cliente (Req. 5.13, 5.14, 19.3).

export type DetectedFileType = 'jpeg' | 'png' | 'pdf';

const SIGNATURES: Readonly<Record<DetectedFileType, readonly number[]>> = {
  jpeg: [0xff, 0xd8, 0xff],
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  pdf: [0x25, 0x50, 0x44, 0x46, 0x2d], // "%PDF-"
};

/** Bytes que hay que leer del inicio del archivo para reconocer cualquiera de los tipos admitidos. */
export const SIGNATURE_BYTES = Math.max(...Object.values(SIGNATURES).map((s) => s.length));

/** Tipo reconocido por la firma de `head`, o null si no coincide con ninguno. */
export function detectFileType(head: Uint8Array): DetectedFileType | null {
  for (const [type, signature] of Object.entries(SIGNATURES) as [DetectedFileType, readonly number[]][]) {
    if (head.length >= signature.length && signature.every((byte, i) => head[i] === byte)) return type;
  }
  return null;
}
