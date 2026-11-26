// Prueba de propiedades de la validación del año de feriados (tarea 3.33, Property 37).
//
// Se generan cadenas de todo tipo: años válidos (con y sin ceros a la izquierda), los límites 1899,
// 1900, 2100 y 2101, negativos, decimales, exponentes, hexadecimales, signo "+", espacios, cadenas muy
// largas de dígitos y texto al azar. El oráculo decide carácter por carácter si la cadena es un entero
// (signo "-" opcional y solo dígitos ASCII, como la interpretación estricta aprobada en la tarea 3.3) y
// compara con BigInt, sin usar Number ni parseIntegerString.
// También se comprueba con el servicio y un `fetch` simulado que un año inválido no consulta Nager.Date.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseYear } from '../../src/domain/holidays';
import { ValidationError } from '../../src/lib/errors';
import { createHolidayService, type FetchLike } from '../../src/services/holidays.service';

const RUNS = { numRuns: 100 };

function expectedYear(text: string): number | null {
  const digits = text.startsWith('-') ? text.slice(1) : text;
  if (digits.length === 0 || ![...digits].every((c) => c >= '0' && c <= '9')) return null;
  const value = BigInt(text);
  return value >= 1900n && value <= 2100n ? Number(value) : null;
}

// Los límites exactos tienen más peso para que cada ejecución de 100 casos los incluya casi con
// seguridad (un corrimiento de ±1 en cualquiera de los dos extremos debe hacer fallar la propiedad).
const yearTextArb = fc.oneof(
  { arbitrary: fc.constantFrom('1899', '1900', '2100', '2101', '01899', '02101'), weight: 5 },
  fc.constantFrom('1901', '2026', '2099', '0', '-2026', '02026', '0001900', '-0'),
  fc.integer({ min: 1850, max: 2150 }).map(String),
  fc.tuple(fc.integer({ min: 1900, max: 2100 }), fc.integer({ min: 1, max: 4 })).map(([y, zeros]) => `${'0'.repeat(zeros)}${y}`),
  fc.integer({ min: 1900, max: 2100 }).chain((y) =>
    fc.constantFrom(` ${y}`, `${y} `, `+${y}`, `${y}.0`, `${y}.5`, `${y}e0`, `0x${y.toString(16)}`, `${y}a`, `${y},`, `２０２６`),
  ),
  fc.constantFrom('', ' ', '-', 'abc', 'NaN', 'Infinity', '2e3', '1e309', '9'.repeat(40), '-'.repeat(2) + '2026'),
  fc.string({ maxLength: 8 }),
  fc.stringMatching(/^-?\d{1,6}$/),
);

describe('Año de feriados (propiedades)', () => {
  // Feature: hospital-management-system, Property 37: Validación del año de feriados
  it('Property 37: parseYear devuelve un entero si y solo si la cadena representa un entero entre 1900 y 2100; si no, error de validación sin consultar Nager.Date', async () => {
    await fc.assert(
      fc.asyncProperty(yearTextArb, async (text) => {
        const expected = expectedYear(text);

        // parseYear.
        if (expected === null) {
          let error: unknown = null;
          try {
            parseYear(text);
          } catch (e) {
            error = e;
          }
          expect(error).toBeInstanceOf(ValidationError);
          expect((error as ValidationError).status).toBe(400);
          expect((error as ValidationError).errors.map((e) => e.field)).toEqual(['year']);
        } else {
          expect(parseYear(text)).toBe(expected);
        }

        // Servicio: un año inválido no consulta Nager.Date; uno válido consulta exactamente una vez.
        const calls: string[] = [];
        const fetch: FetchLike = async (url) => {
          calls.push(url);
          return { ok: true, json: async () => [] };
        };
        const service = createHolidayService({ enabled: true, country: 'MX', fetch, now: () => 0 });
        if (expected === null) {
          await expect(service.getHolidays(text)).rejects.toBeInstanceOf(ValidationError);
          expect(calls).toEqual([]);
        } else {
          await expect(service.getHolidays(text)).resolves.toEqual({ available: true, data: [] });
          expect(calls).toEqual([`https://date.nager.at/api/v3/PublicHolidays/${expected}/MX`]);
        }
      }),
      RUNS,
    );
  });
});
