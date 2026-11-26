// Pruebas de los esquemas zod comunes (tarea 3.3, Req. 3.3, 3.4).

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  INTEGER_MESSAGE,
  NUMBER_TYPE_MESSAGE,
  REQUIRED_MESSAGE,
  TEXT_TYPE_MESSAGE,
  intInRange,
  queryIntInRange,
  requiredText,
  spanishErrorMap,
} from '../../src/schemas/common';

/** Primer mensaje de error, o null si el valor es válido. */
function firstMessage(schema: z.ZodType, value: unknown): string | null {
  const result = schema.safeParse(value, { error: spanishErrorMap });
  return result.success ? null : (result.error.issues[0]?.message ?? '');
}

describe('requiredText', () => {
  const name = requiredText({ max: 10 });

  it('devuelve el texto sin espacios en los extremos', () => {
    expect(name.parse('  Ana  ')).toBe('Ana');
    expect(name.parse('Ana María')).toBe('Ana María');
  });

  it.each(['', '   ', '\t\n ', undefined, null])('rechaza %j como obligatorio', (value) => {
    expect(firstMessage(name, value)).toBe(REQUIRED_MESSAGE);
  });

  it('rechaza valores que no son texto', () => {
    expect(firstMessage(name, 123)).toBe(TEXT_TYPE_MESSAGE);
    expect(firstMessage(name, ['Ana'])).toBe(TEXT_TYPE_MESSAGE);
  });

  it('aplica la longitud máxima después de recortar', () => {
    expect(name.parse(`  ${'a'.repeat(10)}  `)).toBe('a'.repeat(10));
    expect(firstMessage(name, 'a'.repeat(11))).toBe('Debe tener como máximo 10 caracteres.');
  });

  it('usa los mensajes propios indicados', () => {
    const custom = requiredText({ max: 3, required: 'El nombre es obligatorio.', tooLong: 'El nombre es muy largo.' });
    expect(firstMessage(custom, ' ')).toBe('El nombre es obligatorio.');
    expect(firstMessage(custom, 'abcd')).toBe('El nombre es muy largo.');
  });

  it('rechaza una longitud máxima inválida al definir el esquema', () => {
    expect(() => requiredText({ max: 0 })).toThrow(RangeError);
  });
});

describe('intInRange', () => {
  const quantity = intInRange(0, 1000);

  it('acepta enteros dentro del rango, incluidos los límites', () => {
    expect(quantity.parse(0)).toBe(0);
    expect(quantity.parse(1000)).toBe(1000);
    expect(quantity.parse(37)).toBe(37);
  });

  it('rechaza enteros fuera del rango con un mensaje en español', () => {
    expect(firstMessage(quantity, -1)).toBe('Debe ser un número entero entre 0 y 1000.');
    expect(firstMessage(quantity, 1001)).toBe('Debe ser un número entero entre 0 y 1000.');
  });

  it('rechaza decimales, textos y valores no finitos', () => {
    expect(firstMessage(quantity, 1.5)).toBe(INTEGER_MESSAGE);
    expect(firstMessage(quantity, '5')).toBe(NUMBER_TYPE_MESSAGE);
    expect(firstMessage(quantity, Number.NaN)).toBe(NUMBER_TYPE_MESSAGE);
    expect(firstMessage(quantity, Number.POSITIVE_INFINITY)).not.toBeNull();
  });

  it('exige el valor salvo que el esquema sea opcional', () => {
    expect(firstMessage(quantity, undefined)).toBe(REQUIRED_MESSAGE);
    expect(quantity.optional().parse(undefined)).toBeUndefined();
  });

  it('rechaza un rango inválido al definir el esquema', () => {
    expect(() => intInRange(5, 1)).toThrow(RangeError);
    expect(() => intInRange(0, 1.5)).toThrow(RangeError);
  });
});

describe('queryIntInRange', () => {
  const id = queryIntInRange(1, 1_000_000);

  it('convierte un texto de dígitos en número', () => {
    expect(id.parse('15')).toBe(15);
    expect(id.parse('1')).toBe(1);
    expect(id.parse('1000000')).toBe(1_000_000);
  });

  it.each(['abc', '1.5', '1e3', ' 5', '', '0', '1000001', '-1', ['5', '6']])('rechaza %j', (value) => {
    expect(firstMessage(id, value)).toBe('Debe ser un número entero entre 1 y 1000000.');
  });

  it('exige el valor salvo que el esquema sea opcional', () => {
    expect(firstMessage(id, undefined)).toBe(REQUIRED_MESSAGE);
    expect(id.optional().parse(undefined)).toBeUndefined();
  });

  it('usa el mensaje propio indicado', () => {
    expect(firstMessage(queryIntInRange(1, 9, { invalid: 'El año no es válido.' }), 'x')).toBe('El año no es válido.');
  });
});

describe('spanishErrorMap', () => {
  it('da mensajes en español a los errores sin mensaje propio', () => {
    const message = firstMessage(z.object({ active: z.boolean() }), { active: 'sí' });
    expect(message).not.toMatch(/invalid|expected/i);
    expect(message).toMatch(/inválid|esperaba/i);
  });

  it('no cambia la configuración global de zod', () => {
    const result = z.boolean().safeParse('sí');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/invalid/i);
  });
});
