// Prueba de propiedades de validez de Eventos y Días_Inhábiles (tarea 3.26, Property 30).
//
// Eventos: títulos en los límites (vacío, solo espacios, 1, 150 y 151 caracteres, con espacios en los
// extremos), inicio y fin presentes o ausentes (undefined, null o fecha inválida) y fin 1 ms antes,
// igual o después del inicio. La descripción se mantiene en su límite de 500 para la parte "si y solo
// si"; aparte se comprueba que una descripción de 501 da error en su campo (regla del modelo Event).
// Días_Inhábiles: títulos y descripciones en los límites, fechas naturales guardadas con horas
// distintas (la fecha se compara por sus partes UTC, sin zona horaria) y registros existentes que
// coinciden o no, incluida la edición del propio registro.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateEvent, validateNonWorkingDay } from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const DAY = 86_400_000;
const BASE = Date.UTC(2026, 2, 1);

/** Título: el texto "útil" (sin espacios en los extremos) y su longitud esperada. */
const titleArb = fc.oneof(
  fc.constantFrom('', ' ', '   '),
  fc.constantFrom(1, 2, 149, 150, 151, 200).chain((n) =>
    fc.tuple(fc.constantFrom('', ' ', '  '), fc.constantFrom('', ' ')).map(([left, right]) => `${left}${'á'.repeat(n)}${right}`),
  ),
  fc.string({ maxLength: 160 }),
);
const titleValid = (title: unknown) => typeof title === 'string' && title.trim().length >= 1 && title.trim().length <= 150;

const descriptionArb = fc.oneof(fc.constant(undefined), fc.constantFrom(0, 1, 499, 500).map((n) => 'd'.repeat(n)));
const invalidDateArb = fc.constantFrom(undefined, null, new Date(Number.NaN));
const instantArb = fc.integer({ min: BASE, max: BASE + 30 * DAY });

const eventArb = fc.record({
  title: titleArb,
  description: descriptionArb,
  start: fc.oneof({ arbitrary: instantArb.map((t) => new Date(t)), weight: 5 }, { arbitrary: invalidDateArb, weight: 1 }),
  endDelta: fc.oneof(fc.constantFrom(-1, 0, 1), fc.integer({ min: -2 * DAY, max: 2 * DAY })),
  endMissing: fc.integer({ min: 0, max: 5 }).map((n) => n === 0),
  missingKind: invalidDateArb,
  longDescription: fc.boolean(),
});

/** Fecha natural guardada a una hora del día cualquiera (las horas se descartan al comparar). */
const storedDayArb = fc.tuple(fc.integer({ min: 0, max: 9 }), fc.integer({ min: 0, max: DAY - 1 })).map(([d, ms]) => new Date(BASE + d * DAY + ms));

const nonWorkingArb = fc.record({
  title: titleArb,
  description: fc.oneof(fc.constant(undefined), fc.constantFrom(0, 500, 501).map((n) => 'x'.repeat(n))),
  date: fc.oneof({ arbitrary: storedDayArb, weight: 6 }, { arbitrary: invalidDateArb, weight: 1 }),
  existing: fc.array(storedDayArb, { maxLength: 6 }),
  editingId: fc.option(fc.integer({ min: 1, max: 8 }), { nil: undefined }),
  // Fuerza la misma fecha natural que un registro existente (a otra hora), creando o editando ese registro.
  reuseMode: fc.constantFrom('none', 'sameAsExisting', 'editSelf'),
  reuseIndex: fc.nat(),
  reuseMs: fc.integer({ min: 0, max: DAY - 1 }),
});

const naturalDay = (d: Date) => d.toISOString().slice(0, 10);
const isDate = (v: unknown): v is Date => v instanceof Date && !Number.isNaN(v.getTime());

describe('Validez de Eventos y Días_Inhábiles (propiedades)', () => {
  // Feature: hospital-management-system, Property 30: Validez de Eventos y Días_Inhábiles
  it('Property 30: Evento válido si y solo si título 1 a 150, inicio y fin presentes y fin ≥ inicio; Día_Inhábil válido si y solo si título 1 a 150, descripción ≤ 500 y fecha libre', () => {
    fc.assert(
      fc.property(eventArb, nonWorkingArb, (ev, nw) => {
        // ---------- Evento ----------
        const startAt = ev.start;
        const endAt = ev.endMissing ? ev.missingKind : isDate(startAt) ? new Date(startAt.getTime() + ev.endDelta) : new Date(BASE + ev.endDelta);
        const input = { title: ev.title, description: ev.description, startAt, endAt };
        const snapshot = { ...input, startAt: isDate(startAt) ? startAt.getTime() : startAt, endAt: isDate(endAt) ? endAt.getTime() : endAt };

        const expected: string[] = [];
        if (!titleValid(ev.title)) expected.push('title');
        if (!isDate(startAt)) expected.push('startAt');
        if (!isDate(endAt)) expected.push('endAt');
        else if (isDate(startAt) && endAt.getTime() < startAt.getTime()) expected.push('endAt');
        const errors = validateEvent(input);
        expect(errors.map((e) => e.field)).toEqual(expected);
        expect(errors.length === 0).toBe(titleValid(ev.title) && isDate(startAt) && isDate(endAt) && endAt.getTime() >= startAt.getTime());
        expect({ ...input, startAt: isDate(startAt) ? startAt.getTime() : startAt, endAt: isDate(endAt) ? endAt.getTime() : endAt }).toEqual(snapshot);

        // Regla del modelo Event: una descripción de 501 caracteres da error en su campo.
        if (ev.longDescription) {
          expect(validateEvent({ ...input, description: 'd'.repeat(501) }).map((e) => e.field)).toEqual(
            ['title', 'description', 'startAt', 'endAt'].filter((f) => f === 'description' || expected.includes(f)),
          );
        }

        // ---------- Día_Inhábil ----------
        const existing = nw.existing.map((date, i) => ({ id: i + 1, date }));
        if (nw.reuseMode !== 'none' && existing.length > 0) {
          const k = nw.reuseIndex % existing.length;
          const midnight = Date.parse(`${naturalDay((existing[k] as { date: Date }).date)}T00:00:00Z`);
          nw.date = new Date(midnight + nw.reuseMs);
          nw.editingId = nw.reuseMode === 'editSelf' ? k + 1 : undefined;
        }
        const existingSnapshot = existing.map((e) => ({ id: e.id, date: e.date.getTime() }));
        const result = validateNonWorkingDay({ id: nw.editingId, title: nw.title, description: nw.description, date: nw.date }, existing);

        const fieldErrors: string[] = [];
        if (!titleValid(nw.title)) fieldErrors.push('title');
        if (nw.description !== undefined && nw.description.length > 500) fieldErrors.push('description');
        if (!isDate(nw.date)) fieldErrors.push('date');
        const duplicate = isDate(nw.date) && existing.some((e) => e.id !== nw.editingId && naturalDay(e.date) === naturalDay(nw.date as Date));

        if (fieldErrors.length > 0) {
          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.error.status).toBe(400);
            expect((result.error as { errors?: { field: string }[] }).errors?.map((e) => e.field)).toEqual(fieldErrors);
          }
        } else if (duplicate) {
          expect(result.ok).toBe(false);
          if (!result.ok) expect(result.error.status).toBe(409);
        } else {
          expect(result).toEqual({ ok: true });
        }
        expect(existing.map((e) => ({ id: e.id, date: e.date.getTime() }))).toEqual(existingSnapshot);
      }),
      RUNS,
    );
  });
});
