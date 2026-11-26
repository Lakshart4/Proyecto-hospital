// Contraste entre colores según WCAG 2.1 (Req. 15.14).
// Luminancia relativa: L = 0.2126 R + 0.7152 G + 0.0722 B con canales linealizados
// (c ≤ 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ^ 2.4). Contraste = (Lclara + 0.05) / (Loscura + 0.05).

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Canales R, G y B (0 a 255) de un color `#rgb` o `#rrggbb`. @throws RangeError si no es válido. */
export function parseHexColor(color: string): [number, number, number] {
  const match = HEX.exec(color.trim());
  if (!match) throw new RangeError(`Color no válido: ${color}`);
  const digits = match[1]!;
  const full = digits.length === 3 ? [...digits].map((d) => d + d).join('') : digits;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function linearize(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Luminancia relativa de 0 (negro) a 1 (blanco). */
export function relativeLuminance(color: string): number {
  const [r, g, b] = parseHexColor(color).map(linearize) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste entre dos colores, de 1 a 21; no depende del orden de los argumentos. */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a >= b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Contraste mínimo para texto normal (WCAG AA). */
export const MIN_TEXT_CONTRAST = 4.5;
