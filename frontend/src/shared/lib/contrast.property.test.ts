// Prueba de propiedades del contraste de la paleta (tarea 5.2, Property 44).
//
// Para cada par (texto, fondo) declarado en la paleta, contrastRatio es ≥ 4.5. Además, para colores al
// azar (incluidos negro, blanco y los valores cercanos al umbral de linealización), contrastRatio coincide
// con un oráculo independiente de la fórmula WCAG 2.1, es simétrico y queda entre 1 y 21, de modo que una
// fórmula incorrecta no pueda dar por buenos pares que no lo son. Todos los pares declarados se revisan
// siempre como ejemplos fijos.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { TEXT_COLOR_PAIRS } from './colors';
import { contrastRatio } from './contrast';

const RUNS = { numRuns: 100 };

/** Oráculo: fórmula WCAG escrita aparte, sobre canales enteros. */
function oracleLuminance(hex: string): number {
  const value = hex.length === 4 ? hex.slice(1).split('').map((d) => d + d).join('') : hex.slice(1);
  const channels = [0, 2, 4].map((i) => Number.parseInt(value.slice(i, i + 2), 16) / 255);
  const lin = channels.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
}
function oracleRatio(a: string, b: string): number {
  const la = oracleLuminance(a);
  const lb = oracleLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const channelArb = fc.oneof({ arbitrary: fc.constantFrom(0, 9, 10, 11, 128, 254, 255), weight: 2 }, fc.integer({ min: 0, max: 255 }));
const hexArb = fc.oneof(
  fc.tuple(channelArb, channelArb, channelArb).map((c) => `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`),
  fc.tuple(fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 15 }), fc.integer({ min: 0, max: 15 })).map((c) => `#${c.map((v) => v.toString(16)).join('')}`),
  fc.constantFrom('#000000', '#ffffff', '#FFFFFF', '#777777', '#767676'),
);

type Case = [{ name: string; fg: string; bg: string }, string, string];
const declared = fc.constantFrom(...TEXT_COLOR_PAIRS);
const EXAMPLES: Case[] = TEXT_COLOR_PAIRS.map((pair): Case => [pair, '#000000', '#ffffff']);

describe('Contraste de la paleta (propiedades)', () => {
  // Feature: hospital-management-system, Property 44: Contraste de la paleta
  it('Property 44: todo par (texto, fondo) declarado en la paleta tiene contrastRatio ≥ 4.5, y contrastRatio sigue la fórmula WCAG', () => {
    fc.assert(
      fc.property(declared, hexArb, hexArb, (pair, a, b) => {
        expect(contrastRatio(pair.fg, pair.bg)).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(pair.fg, pair.bg)).toBeCloseTo(oracleRatio(pair.fg, pair.bg), 10);

        const ratio = contrastRatio(a, b);
        expect(ratio).toBeCloseTo(oracleRatio(a, b), 10);
        expect(ratio).toBe(contrastRatio(b, a));
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21 + 1e-9);
        expect(contrastRatio(a, a)).toBe(1);
      }),
      { ...RUNS, examples: EXAMPLES },
    );
  });
});
