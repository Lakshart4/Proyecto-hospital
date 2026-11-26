// Prueba de propiedades del Calendario_de_Turnos (tarea 3.30, Property 34).
//
// Se genera personal de los cuatro roles, activo o inactivo, de ambos Turnos, con Horario_de_Trabajo en
// algunos días de la semana, y un rango de 2026 que a menudo empieza o termina justo en la medianoche de
// México (05:59:59.999 / 06:00 UTC). Decisiones aprobadas en la tarea 3.24: los días del rango se toman en
// hora institucional, el Administrador no es Empleado y un Empleado sin horario ese día no aparece.
// El oráculo es independiente de domain/time.ts: en 2026 México está fijo en UTC-6, así que la fecha local
// de un instante t es la fecha UTC de t - 6 h, y la hora local HH:mm de un día D es D HH:mm UTC + 6 h.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { shiftCalendar, shiftCalendarFor, type ShiftDay, type StaffLike } from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const DAY = 86_400_000;
const OFFSET = 6 * 3_600_000;
const BASE = Date.UTC(2026, 0, 5);
const SHIFTS = ['matutino', 'vespertino'] as const;

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const slotArb = fc
  .tuple(fc.integer({ min: 0, max: 22 * 60 }), fc.integer({ min: 1, max: 10 * 60 }))
  .map(([start, length]) => ({ startTime: hhmm(start), endTime: hhmm(Math.min(23 * 60 + 59, start + length)) }));

const staffArb = fc.array(
  fc.record({
    role: fc.constantFrom('DOCTOR' as const, 'NURSE' as const, 'CLEANING' as const, 'ADMIN' as const),
    active: fc.oneof({ arbitrary: fc.constant(true), weight: 3 }, { arbitrary: fc.constant(false), weight: 1 }),
    shift: fc.constantFrom(...SHIFTS),
    days: fc.uniqueArray(fc.integer({ min: 0, max: 6 }), { maxLength: 7 }),
    slot: slotArb,
  }),
  { maxLength: 10 },
);

const rangeArb = fc
  .record({
    fromDay: fc.integer({ min: 0, max: 300 }),
    fromMs: fc.oneof(fc.constantFrom(OFFSET - 1, OFFSET, OFFSET + 1), fc.integer({ min: 0, max: DAY - 1 })),
    lengthMs: fc.oneof(fc.constantFrom(0, 1, DAY - 1, DAY), fc.integer({ min: 0, max: 20 * DAY })),
  })
  .map(({ fromDay, fromMs, lengthMs }) => {
    const from = BASE + fromDay * DAY + fromMs;
    return { from, to: from + lengthMs };
  });

const localIso = (t: number) => new Date(t - OFFSET).toISOString().slice(0, 10);

/** Calendario esperado para un personal ya filtrado (todos o solo el actor). */
function expectedDays(staff: StaffLike[], from: number, to: number) {
  const days: { date: string; dayOfWeek: number; shifts: Record<string, { userId: number; startTime: string; endTime: string; startAt: number; endAt: number }[]> }[] = [];
  for (let t = Date.parse(`${localIso(from)}T00:00:00Z`); t <= Date.parse(`${localIso(to)}T00:00:00Z`); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    const weekday = new Date(t).getUTCDay();
    const shifts: Record<string, { userId: number; startTime: string; endTime: string; startAt: number; endAt: number }[]> = {};
    for (const shift of SHIFTS) {
      shifts[shift] = staff
        .filter((s) => s.active && s.role !== 'ADMIN' && s.shift === shift)
        .flatMap((s) => {
          const slot = s.schedule.find((d) => d.dayOfWeek === weekday);
          return slot
            ? [{ userId: s.id, startTime: slot.startTime, endTime: slot.endTime, startAt: Date.parse(`${date}T${slot.startTime}:00Z`) + OFFSET, endAt: Date.parse(`${date}T${slot.endTime}:00Z`) + OFFSET }]
            : [];
        })
        .sort((a, b) => a.userId - b.userId);
    }
    days.push({ date, dayOfWeek: weekday, shifts });
  }
  return days;
}

/** Forma comparable del resultado, con las entradas ordenadas por usuario. */
const normalize = (days: ShiftDay[]) =>
  days.map((d) => ({
    date: d.date,
    dayOfWeek: d.dayOfWeek,
    shifts: Object.fromEntries(
      Object.entries(d.shifts).map(([shift, list]) => [
        shift,
        (list ?? [])
          .map((e) => ({ userId: e.userId, startTime: e.startTime, endTime: e.endTime, startAt: e.startAt.getTime(), endAt: e.endAt.getTime() }))
          .sort((a, b) => a.userId - b.userId),
      ]),
    ),
  }));

describe('Calendario de turnos (propiedades)', () => {
  // Feature: hospital-management-system, Property 34: Calendario_de_Turnos
  it('Property 34: cada día y Turno lista exactamente a los Empleados activos con su horario; un Empleado ve solo su Turno', () => {
    fc.assert(
      fc.property(staffArb, rangeArb, fc.nat(), (raw, { from, to }, actorPick) => {
        const staff: StaffLike[] = raw.map((s, i) => ({
          id: i + 1,
          name: `Persona ${i + 1}`,
          role: s.role,
          active: s.active,
          shift: s.shift,
          birthDate: null,
          schedule: s.days.map((dayOfWeek) => ({ dayOfWeek, ...s.slot })),
        }));
        const snapshot = JSON.stringify(staff);

        // Administrador y cálculo general: todos los Empleados activos de cada Turno.
        const all = expectedDays(staff, from, to);
        expect(normalize(shiftCalendar(staff, new Date(from), new Date(to)))).toEqual(all);
        expect(normalize(shiftCalendarFor({ id: 999, role: 'ADMIN' }, staff, new Date(from), new Date(to)))).toEqual(all);

        // Un Empleado: únicamente su propio Turno con su propio horario.
        const employees = staff.filter((s) => s.role !== 'ADMIN');
        if (employees.length > 0) {
          const actor = employees[actorPick % employees.length] as StaffLike;
          const own = normalize(shiftCalendarFor({ id: actor.id, role: actor.role }, staff, new Date(from), new Date(to)));
          const expected = expectedDays([actor], from, to).map((d) => ({ ...d, shifts: { [actor.shift]: d.shifts[actor.shift] } }));
          expect(own).toEqual(expected);
          for (const d of own) {
            expect(Object.keys(d.shifts)).toEqual([actor.shift]);
            for (const e of d.shifts[actor.shift] ?? []) expect(e.userId).toBe(actor.id);
          }
        }

        expect(JSON.stringify(staff)).toBe(snapshot);
      }),
      RUNS,
    );
  });
});
