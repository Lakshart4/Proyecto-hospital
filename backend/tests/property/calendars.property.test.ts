// Prueba de propiedades de la composición de los calendarios general y de actividades (tarea 3.29, Property 33).
//
// Se generan Eventos de los cuatro tipos guardados, Días_Inhábiles, feriados disponibles y entregas en
// los tres estados, alrededor de un rango [desde, hasta] de 2026. Los extremos de Eventos y entregas se
// colocan a menudo justo sobre los extremos del rango o a 1 ms de ellos, y los días completos caen dentro,
// en el borde o fuera del rango. Según la decisión confirmada, los dos calendarios filtran por el rango.
// El oráculo es independiente de domain/time.ts: en 2026 México está fijo en UTC-6, así que un día
// natural D ocupa [D 06:00 UTC, D+1 05:59:59.999 UTC].

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  activitiesCalendar,
  generalCalendar,
  type CalendarDeliveryLike,
  type CalendarEvent,
  type EventLike,
  type HolidayLike,
  type NonWorkingDayLike,
} from '../../src/domain/events';

const RUNS = { numRuns: 100 };
const DAY = 86_400_000;
const OFFSET = 6 * 3_600_000; // medianoche en México = 06:00 UTC en 2026
const BASE = Date.UTC(2026, 2, 1);

const dayStart = (iso: string) => Date.parse(`${iso}T00:00:00Z`) + OFFSET;
const isoDay = (n: number) => new Date(BASE + n * DAY).toISOString().slice(0, 10);
/** Hay solape si los dos intervalos comparten algún instante. */
const shares = (a: number, b: number, from: number, to: number) => Math.max(a, from) <= Math.min(b, to);

const scenarioArb = fc
  .record({
    fromDay: fc.integer({ min: 2, max: 20 }),
    fromMs: fc.oneof(fc.constant(OFFSET), fc.integer({ min: 0, max: DAY - 1 })),
    lengthMs: fc.oneof(fc.constantFrom(0, 1, DAY - 1), fc.integer({ min: 0, max: 10 * DAY })),
  })
  .chain(({ fromDay, fromMs, lengthMs }) => {
    const from = BASE + fromDay * DAY + fromMs;
    const to = from + lengthMs;
    const near = fc.oneof(
      fc.constantFrom(from - 1, from, from + 1, to - 1, to, to + 1),
      fc.integer({ min: from - 3 * DAY, max: to + 3 * DAY }),
    );
    const dayIndex = fc.integer({ min: fromDay - 3, max: fromDay + 14 });
    return fc.record({
      from: fc.constant(from),
      to: fc.constant(to),
      events: fc.array(
        fc.record({
          type: fc.constantFrom('general' as const, 'actividad' as const, 'entrega' as const, 'agenda individual' as const),
          start: near,
          durationMs: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 2 * DAY })),
        }),
        { maxLength: 12 },
      ),
      nonWorkingDays: fc.uniqueArray(dayIndex, { maxLength: 6 }),
      holidays: fc.uniqueArray(dayIndex, { maxLength: 6 }),
      deliveries: fc.array(
        fc.record({ status: fc.constantFrom('programada' as const, 'recibida' as const, 'cancelada' as const), at: near }),
        { maxLength: 12 },
      ),
    });
  });

describe('Calendarios general y de actividades (propiedades)', () => {
  // Feature: hospital-management-system, Property 33: Composición de los calendarios general y de actividades
  it('Property 33: el general y el de actividades contienen exactamente sus elementos solapados con el rango y nunca una entrega cancelada', () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const events: EventLike[] = s.events.map((e, i) => ({
          id: i + 1,
          title: `E${i + 1}`,
          type: e.type,
          startAt: new Date(e.start),
          endAt: new Date(e.start + e.durationMs),
        }));
        const nonWorkingDays: NonWorkingDayLike[] = s.nonWorkingDays.map((n, i) => ({
          id: i + 1,
          title: 'Inhábil',
          date: new Date(Date.parse(`${isoDay(n)}T00:00:00Z`)),
        }));
        const holidays: HolidayLike[] = s.holidays.map((n) => ({ date: isoDay(n), name: 'Feriado' }));
        const deliveries: CalendarDeliveryLike[] = s.deliveries.map((d, i) => ({
          id: i + 1,
          status: d.status,
          scheduledDate: new Date(d.at),
          supplierName: 'Proveedor',
          productName: `Producto ${i + 1}`,
          quantityRequested: 5,
        }));
        const snapshot = JSON.stringify({ events, nonWorkingDays, holidays, deliveries });
        const from = new Date(s.from);
        const to = new Date(s.to);

        // ---------- Oráculo ----------
        const eventIds = (types: string[]) =>
          events.filter((e) => types.includes(e.type) && shares(e.startAt.getTime(), e.endAt.getTime(), s.from, s.to)).map((e) => `event:${e.id}`);
        const visibleDeliveries = deliveries
          .filter((d) => d.status !== 'cancelada' && d.scheduledDate.getTime() >= s.from && d.scheduledDate.getTime() <= s.to)
          .map((d) => `delivery:${d.id}`);
        const dayInRange = (iso: string) => shares(dayStart(iso), dayStart(iso) + DAY - 1, s.from, s.to);
        const expectedGeneral = [
          ...eventIds(['general']),
          ...nonWorkingDays.filter((n) => dayInRange(n.date.toISOString().slice(0, 10))).map((n) => `nonWorkingDay:${n.id}`),
          ...holidays.filter((h) => dayInRange(h.date)).map((h) => `holiday:${h.date}`),
          ...visibleDeliveries,
        ].sort();
        const expectedActivities = [...eventIds(['actividad', 'entrega']), ...visibleDeliveries].sort();

        // ---------- Comprobaciones ----------
        const general = generalCalendar({ from, to, events, nonWorkingDays, holidays, deliveries });
        const activities = activitiesCalendar({ from, to, events, deliveries });
        expect(general.map((g) => g.id).sort()).toEqual(expectedGeneral);
        expect(activities.map((a) => a.id).sort()).toEqual(expectedActivities);

        const cancelled = new Set(deliveries.filter((d) => d.status === 'cancelada').map((d) => `delivery:${d.id}`));
        for (const list of [general, activities] as CalendarEvent[][]) {
          expect(list.some((x) => cancelled.has(x.id))).toBe(false);
          for (let k = 1; k < list.length; k++) expect(list[k - 1]!.start.getTime()).toBeLessThanOrEqual(list[k]!.start.getTime());
        }

        // Las entradas no cambian.
        expect(JSON.stringify({ events, nonWorkingDays, holidays, deliveries })).toBe(snapshot);
      }),
      RUNS,
    );
  });
});
