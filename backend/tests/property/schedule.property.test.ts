// Prueba de propiedades de validación del Horario_de_Trabajo (tarea 3.22, Property 25).
//
// Dos partes en una sola propiedad:
// 1. Días aleatorios (horas válidas e inválidas, comida opcional, 0 a 4 descansos): la lista de errores
//    está vacía si y solo si se cumplen las reglas de Property 25, evaluadas por un oráculo propio.
// 2. Días válidos construidos (con comida y descansos que a veces se tocan entre sí o con los extremos)
//    a los que se aplica como máximo un fallo conocido: el resultado debe ser vacío sin fallo, o
//    identificar exactamente el campo de ese fallo.
// Las decisiones aprobadas en la tarea 3.21 forman parte del oráculo: límites del horario incluidos,
// intervalos que solo se tocan no se solapan, comida opcional con inicio anterior al fin.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateDaySchedule, type DaySchedule, type TimeRange } from '../../src/domain/schedule';

const RUNS = { numRuns: 100 };
const LAST = 23 * 60 + 59;

const hhmm = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const BAD_TIMES = ['8:00', '24:00', '12:60', 'ab:cd', '', '07:5', '07.30'];

// ---------- Oráculo independiente ----------

/** Minutos de un texto HH:mm o null; comprueba cada carácter en lugar de usar una expresión regular. */
function minutesOf(value: unknown): number | null {
  if (typeof value !== 'string' || value.length !== 5 || value[2] !== ':') return null;
  const digits = value.slice(0, 2) + value.slice(3);
  if (![...digits].every((c) => c >= '0' && c <= '9')) return null;
  const h = Number(value.slice(0, 2));
  const m = Number(value.slice(3));
  return h <= 23 && m <= 59 ? h * 60 + m : null;
}

function isValidDay(day: DaySchedule): boolean {
  const s = minutesOf(day.startTime);
  const e = minutesOf(day.endTime);
  if (s === null || e === null || !(e > s)) return false;
  const inside = (a: number, b: number) => a >= s && b <= e;
  const noMealStart = day.mealStart === null || day.mealStart === undefined || day.mealStart === '';
  const noMealEnd = day.mealEnd === null || day.mealEnd === undefined || day.mealEnd === '';
  let meal: [number, number] | null = null;
  if (noMealStart !== noMealEnd) return false;
  if (!noMealStart) {
    const a = minutesOf(day.mealStart);
    const b = minutesOf(day.mealEnd);
    if (a === null || b === null || !(a < b) || !inside(a, b)) return false;
    meal = [a, b];
  }
  if (day.breaks.length > 3) return false;
  const intervals: [number, number][] = [];
  for (const br of day.breaks) {
    const a = minutesOf(br.startTime);
    const b = minutesOf(br.endTime);
    if (a === null || b === null || !(a < b) || !inside(a, b)) return false;
    intervals.push([a, b]);
  }
  const share = (x: [number, number], y: [number, number]) => Math.max(x[0], y[0]) < Math.min(x[1], y[1]);
  for (let i = 0; i < intervals.length; i++) {
    if (meal && share(intervals[i] as [number, number], meal)) return false;
    for (let j = 0; j < i; j++) if (share(intervals[i] as [number, number], intervals[j] as [number, number])) return false;
  }
  return true;
}

// ---------- Días aleatorios ----------

const timeTextArb = fc.oneof({ arbitrary: fc.integer({ min: 0, max: LAST }).map(hhmm), weight: 9 }, { arbitrary: fc.constantFrom(...BAD_TIMES), weight: 1 });
const randomDayArb: fc.Arbitrary<DaySchedule> = fc.record({
  startTime: timeTextArb,
  endTime: timeTextArb,
  mealStart: fc.option(timeTextArb, { nil: null }),
  mealEnd: fc.option(timeTextArb, { nil: null }),
  breaks: fc.array(fc.record({ startTime: timeTextArb, endTime: timeTextArb }), { maxLength: 4 }),
});

// ---------- Días válidos construidos y fallos conocidos ----------

interface BuiltDay {
  start: number;
  end: number;
  meal: [number, number] | null;
  breaks: [number, number][];
  /** Un intervalo libre adicional (para construir un cuarto descanso válido). */
  spare: [number, number] | null;
}

/** Hasta 5 intervalos ordenados dentro de [start, end], a veces tocándose entre sí o con los extremos. */
const builtDayArb: fc.Arbitrary<BuiltDay> = fc
  .record({
    start: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: LAST - 40 })),
    length: fc.integer({ min: 40, max: 600 }),
    count: fc.oneof(fc.integer({ min: 0, max: 5 }), fc.constantFrom(4, 5)),
    cuts: fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 10, maxLength: 10 }),
    touches: fc.array(fc.boolean(), { minLength: 10, maxLength: 10 }),
    hasMeal: fc.boolean(),
    mealSlot: fc.nat(),
  })
  .map(({ start, length, count, cuts, touches, hasMeal, mealSlot }) => {
    const end = Math.min(LAST, start + length);
    // 2·count puntos distintos y ordenados en [start, end]; a veces un intervalo empieza donde acaba el anterior.
    const span = end - start;
    const points = cuts
      .slice(0, 2 * count)
      .map((c) => start + Math.floor(c * (span + 1)))
      .sort((a, b) => a - b);
    const intervals: [number, number][] = [];
    for (let k = 0; k < count; k++) {
      let a = points[2 * k] as number;
      let b = points[2 * k + 1] as number;
      const prevEnd = intervals.length > 0 ? (intervals[intervals.length - 1] as [number, number])[1] : start;
      if (touches[k]) a = prevEnd;
      a = Math.max(a, prevEnd);
      b = Math.max(b, a + 1);
      if (b > end) break;
      intervals.push([a, b]);
    }
    let meal: [number, number] | null = null;
    if (hasMeal && intervals.length > 0) meal = intervals.splice(mealSlot % intervals.length, 1)[0] as [number, number];
    const spare = intervals.length > 3 ? (intervals.splice(3, 1)[0] as [number, number]) : null;
    return { start, end, meal, breaks: intervals.slice(0, 3), spare };
  });

const toDay = (b: BuiltDay): DaySchedule => ({
  startTime: hhmm(b.start),
  endTime: hhmm(b.end),
  mealStart: b.meal ? hhmm(b.meal[0]) : null,
  mealEnd: b.meal ? hhmm(b.meal[1]) : null,
  breaks: b.breaks.map(([a, c]) => ({ startTime: hhmm(a), endTime: hhmm(c) })),
});

type Fault =
  | 'none'
  | 'badFormat'
  | 'endNotAfterStart'
  | 'mealMissingEnd'
  | 'mealMissingStart'
  | 'mealReversed'
  | 'mealOutside'
  | 'tooManyBreaks'
  | 'breakReversed'
  | 'breakOutside'
  | 'breakOverlapsMeal'
  | 'breakOverlapsBreak';

/** Aplica un fallo si el día lo permite; devuelve el día y el campo esperado (o null si sigue válido). */
function applyFault(b: BuiltDay, fault: Fault, pick: number, bad: string): { day: DaySchedule; field: string | null } {
  const day = toDay(b);
  const breaks = day.breaks as TimeRange[];
  const i = breaks.length > 0 ? pick % breaks.length : 0;
  switch (fault) {
    case 'badFormat': {
      const targets: [string, () => void][] = [
        ['startTime', () => (day.startTime = bad)],
        ['endTime', () => (day.endTime = bad)],
      ];
      if (b.meal) {
        targets.push(['mealStart', () => (day.mealStart = bad)], ['mealEnd', () => (day.mealEnd = bad)]);
      }
      breaks.forEach((_, k) => {
        targets.push([`breaks.${k}.startTime`, () => (breaks[k] = { ...(breaks[k] as TimeRange), startTime: bad })]);
        targets.push([`breaks.${k}.endTime`, () => (breaks[k] = { ...(breaks[k] as TimeRange), endTime: bad })]);
      });
      const [field, apply] = targets[pick % targets.length] as [string, () => void];
      apply();
      return { day, field };
    }
    case 'endNotAfterStart':
      day.endTime = pick % 2 === 0 ? day.startTime : hhmm(Math.max(0, b.start - 1));
      return { day, field: 'endTime' };
    case 'mealMissingEnd':
      if (!b.meal) break;
      day.mealEnd = null;
      return { day, field: 'mealEnd' };
    case 'mealMissingStart':
      if (!b.meal) break;
      day.mealStart = '';
      return { day, field: 'mealStart' };
    case 'mealReversed':
      if (!b.meal) break;
      [day.mealStart, day.mealEnd] = [day.mealEnd, day.mealStart];
      return { day, field: 'mealEnd' };
    case 'mealOutside':
      if (!b.meal || b.end >= LAST) break;
      // Justo después de la salida: no se solapa con ningún descanso (todos terminan antes o en la salida).
      day.mealStart = hhmm(b.end);
      day.mealEnd = hhmm(b.end + 1);
      return { day, field: 'mealStart' };
    case 'tooManyBreaks':
      if (breaks.length >= 3 && b.spare) {
        breaks.push({ startTime: hhmm(b.spare[0]), endTime: hhmm(b.spare[1]) });
      } else {
        // Si el día generado no tiene sitio libre, 4 descansos válidos de un minuto al inicio, sin comida.
        day.mealStart = null;
        day.mealEnd = null;
        day.breaks = [0, 2, 4, 6].map((k) => ({ startTime: hhmm(b.start + k), endTime: hhmm(b.start + k + 1) }));
      }
      return { day, field: 'breaks' };
    case 'breakReversed':
      if (breaks.length === 0) break;
      breaks[i] = { startTime: (breaks[i] as TimeRange).endTime, endTime: (breaks[i] as TimeRange).startTime };
      return { day, field: `breaks.${i}.endTime` };
    case 'breakOutside': {
      if (breaks.length === 0) break;
      const outside = b.end < LAST ? [b.end, b.end + 1] : b.start > 0 ? [b.start - 1, b.start] : null;
      if (!outside) break;
      breaks[i] = { startTime: hhmm(outside[0] as number), endTime: hhmm(outside[1] as number) };
      return { day, field: `breaks.${i}` };
    }
    case 'breakOverlapsMeal':
      if (breaks.length === 0 || !b.meal) break;
      // Un minuto dentro de la comida: se solapa con ella y con ningún otro descanso.
      breaks[i] = { startTime: hhmm(b.meal[0]), endTime: hhmm(b.meal[0] + 1) };
      return { day, field: `breaks.${i}` };
    case 'breakOverlapsBreak':
      if (breaks.length < 2) break;
      breaks[1] = { ...(breaks[0] as TimeRange) };
      return { day, field: 'breaks.1' };
    case 'none':
      break;
  }
  return { day: toDay(b), field: null };
}

const faultArb = fc.constantFrom<Fault>(
  'none',
  'badFormat',
  'endNotAfterStart',
  'mealMissingEnd',
  'mealMissingStart',
  'mealReversed',
  'mealOutside',
  'tooManyBreaks',
  'breakReversed',
  'breakOutside',
  'breakOverlapsMeal',
  'breakOverlapsBreak',
);

const scenarioArb = fc.record({
  random: randomDayArb,
  built: builtDayArb,
  fault: faultArb,
  pick: fc.nat(),
  bad: fc.constantFrom(...BAD_TIMES),
});

describe('Horario de trabajo (propiedades)', () => {
  // Feature: hospital-management-system, Property 25: Validación del Horario_de_Trabajo
  it('Property 25: la lista de errores está vacía si y solo si el día cumple las reglas, e identifica el campo inválido', () => {
    fc.assert(
      fc.property(scenarioArb, ({ random, built, fault, pick, bad }) => {
        // 1. Día aleatorio: vacía si y solo si es válido; si no, al menos un error con campo y mensaje.
        const randomCopy = structuredClone(random);
        const randomErrors = validateDaySchedule(random);
        expect(randomErrors.length === 0).toBe(isValidDay(random));
        for (const e of randomErrors) {
          expect(e.field).toMatch(/^(startTime|endTime|mealStart|mealEnd|breaks(\.\d+(\.(startTime|endTime))?)?)$/);
          expect(e.message.length).toBeGreaterThan(0);
        }
        expect(random).toEqual(randomCopy);

        // 2. Día válido con como máximo un fallo conocido.
        const { day, field } = applyFault(built, fault, pick, bad);
        const dayCopy = structuredClone(day);
        const errors = validateDaySchedule(day);
        expect(isValidDay(day)).toBe(field === null);
        expect(errors.map((e) => e.field)).toEqual(field === null ? [] : [field]);
        expect(day).toEqual(dayCopy);
      }),
      RUNS,
    );
  });
});
