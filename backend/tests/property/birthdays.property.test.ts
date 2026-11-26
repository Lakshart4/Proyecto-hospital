// Prueba de propiedades de los eventos de cumpleaños (tarea 3.28, Property 32).
//
// Se genera personal de los cuatro roles, activo o inactivo, con o sin fecha de nacimiento. Las fechas
// de nacimiento incluyen el 29 de febrero, el 1 de enero y el 31 de diciembre, y se guardan a distintas
// horas del día UTC (incluidas horas que en México todavía son el día anterior), porque son fechas
// naturales que se leen sin zona horaria (decisión aprobada en la tarea 3.24). Los años incluyen
// bisiestos y no bisiestos, entre ellos 1900, 2000 y 2100.
// El oráculo calcula los años bisiestos con la regla gregoriana escrita aquí y la fecha esperada a
// partir de la representación ISO de la fecha guardada. Solo los Empleados (DOCTOR, NURSE, CLEANING)
// tienen cumpleaños: el Administrador no es Empleado según el glosario (decisión de la tarea 3.24).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { birthdayEvents, type StaffLike } from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const DAY = 86_400_000;

const leap = (y: number) => y % 400 === 0 || (y % 4 === 0 && y % 100 !== 0);
const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Fecha natural de nacimiento como texto "AAAA-MM-DD". */
const birthDateTextArb = fc.oneof(
  fc.constantFrom('1992-02-29', '1988-02-29', '2000-02-29', '1990-01-01', '1985-12-31', '1979-03-01', '1996-02-28'),
  fc.integer({ min: Date.UTC(1940, 0, 1), max: Date.UTC(2006, 11, 31) }).map((t) => new Date(t).toISOString().slice(0, 10)),
);

const staffArb = fc.array(
  fc.record({
    role: fc.constantFrom('DOCTOR' as const, 'NURSE' as const, 'CLEANING' as const, 'ADMIN' as const),
    active: fc.boolean(),
    birth: fc.option(birthDateTextArb, { nil: null }),
    // Hora a la que quedó guardada la fecha natural (00:00 a 23:59:59.999 UTC).
    storedAtMs: fc.oneof(fc.constantFrom(0, 3 * 3_600_000, DAY - 1), fc.integer({ min: 0, max: DAY - 1 })),
  }),
  { maxLength: 15 },
);

const yearArb = fc.oneof(fc.constantFrom(1900, 2000, 2023, 2024, 2025, 2026, 2028, 2100), fc.integer({ min: 1900, max: 2100 }));

describe('Cumpleaños (propiedades)', () => {
  // Feature: hospital-management-system, Property 32: Eventos de cumpleaños
  it('Property 32: un cumpleaños por Empleado activo con fecha de nacimiento, en su día y mes del año (29/2 → 28/2 si no es bisiesto)', () => {
    fc.assert(
      fc.property(staffArb, yearArb, (raw, year) => {
        const staff: StaffLike[] = raw.map((s, i) => ({
          id: i + 1,
          name: `Persona ${i + 1}`,
          role: s.role,
          active: s.active,
          shift: 'matutino',
          birthDate: s.birth === null ? null : new Date(Date.parse(`${s.birth}T00:00:00Z`) + s.storedAtMs),
          schedule: [],
        }));
        const snapshot = staff.map((s) => ({ ...s, birthDate: s.birthDate?.getTime() ?? null }));

        const result = birthdayEvents(staff, year);

        // Exactamente uno por Empleado activo con fecha de nacimiento; ninguno para el resto.
        const expected = staff
          .filter((s) => s.active && s.role !== 'ADMIN' && s.birthDate !== null)
          .map((s) => {
            const [, mm, dd] = (s.birthDate as Date).toISOString().slice(0, 10).split('-');
            const day = mm === '02' && dd === '29' && !leap(year) ? '28' : (dd as string);
            return { id: `birthday:${s.id}:${year}`, date: `${pad(year, 4)}-${mm}-${day}` };
          });
        expect(result.map((e) => ({ id: e.id, date: e.date })).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
          [...expected].sort((a, b) => a.id.localeCompare(b.id)),
        );

        for (const e of result) {
          expect(e.type).toBe('cumpleaños');
          expect(e.source).toBe('birthday');
          expect(e.allDay).toBe(true);
          // Desde 2023 México está fijo en UTC-6: el día ocupa de las 06:00 UTC a las 05:59:59.999 del día siguiente.
          if (year >= 2023) {
            const midnight = Date.parse(`${e.date}T00:00:00Z`) + 6 * 3_600_000;
            expect([e.start.getTime(), e.end.getTime()]).toEqual([midnight, midnight + DAY - 1]);
          }
        }

        // El personal recibido no cambia.
        expect(staff.map((s) => ({ ...s, birthDate: s.birthDate?.getTime() ?? null }))).toEqual(snapshot);
      }),
      RUNS,
    );
  });
});
