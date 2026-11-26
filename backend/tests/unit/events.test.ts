// Pruebas de las reglas de calendarios y eventos (tarea 3.24).
// Las propiedades 22 y 30 a 36 corresponden a las tareas 3.25 a 3.31.

import { describe, expect, it } from 'vitest';
import { EVENT_TYPES } from '../../src/domain/constants';
import {
  EVENT_MESSAGES,
  activitiesCalendar,
  birthdayEvents,
  eventColor,
  fromDelivery,
  fromEvent,
  generalCalendar,
  overlaps,
  shiftCalendar,
  shiftCalendarFor,
  upcomingWindow,
  validateEvent,
  validateNonWorkingDay,
  type CalendarDeliveryLike,
  type EventLike,
  type StaffLike,
} from '../../src/domain/events';
import { dayRange } from '../../src/domain/time';

const d = (iso: string) => new Date(iso);
const ids = (list: { id: string }[]) => list.map((x) => x.id);

describe('eventColor', () => {
  it('asigna un color distinto a cada uno de los 7 Tipos_de_Evento', () => {
    const colors = EVENT_TYPES.map(eventColor);
    expect(EVENT_TYPES).toHaveLength(7);
    expect(new Set(colors).size).toBe(7);
  });
});

describe('overlaps', () => {
  const march10 = dayRange('2026-03-10');
  it('un evento que termina el día de inicio del rango se solapa', () => {
    expect(overlaps({ start: d('2026-03-09T15:00:00Z'), end: d('2026-03-10T15:00:00Z') }, march10.start, march10.end)).toBe(true);
  });
  it('incluye los extremos exactos y excluye 1 ms fuera', () => {
    expect(overlaps({ start: d('2026-03-09T00:00:00Z'), end: march10.start }, march10.start, march10.end)).toBe(true);
    expect(overlaps({ start: march10.end, end: d('2026-03-12T00:00:00Z') }, march10.start, march10.end)).toBe(true);
    expect(overlaps({ start: d('2026-03-09T00:00:00Z'), end: new Date(march10.start.getTime() - 1) }, march10.start, march10.end)).toBe(false);
    expect(overlaps({ start: new Date(march10.end.getTime() + 1), end: d('2026-03-12T00:00:00Z') }, march10.start, march10.end)).toBe(false);
  });
});

const staff: StaffLike[] = [
  { id: 1, name: 'Ana', role: 'DOCTOR', active: true, shift: 'matutino', birthDate: d('1992-02-29T00:00:00Z'), schedule: [{ dayOfWeek: 2, startTime: '08:00', endTime: '15:00' }] },
  { id: 2, name: 'Luis', role: 'NURSE', active: true, shift: 'vespertino', birthDate: d('1985-03-10T00:00:00Z'), schedule: [{ dayOfWeek: 2, startTime: '15:00', endTime: '22:00' }] },
  { id: 3, name: 'Eva', role: 'CLEANING', active: false, shift: 'matutino', birthDate: d('1990-05-01T00:00:00Z'), schedule: [{ dayOfWeek: 2, startTime: '07:00', endTime: '14:00' }] },
  { id: 4, name: 'Director', role: 'ADMIN', active: true, shift: 'matutino', birthDate: d('1972-05-14T00:00:00Z'), schedule: [{ dayOfWeek: 2, startTime: '09:00', endTime: '17:00' }] },
  { id: 5, name: 'Sol', role: 'NURSE', active: true, shift: 'matutino', birthDate: null, schedule: [{ dayOfWeek: 3, startTime: '08:00', endTime: '15:00' }] },
];

describe('birthdayEvents', () => {
  it('genera un cumpleaños por Empleado activo con fecha de nacimiento, sin inactivos, sin Administrador y sin fecha', () => {
    expect(ids(birthdayEvents(staff, 2026))).toEqual(['birthday:1:2026', 'birthday:2:2026']);
  });

  it('el 29 de febrero se muestra el 28 en años no bisiestos y el 29 en bisiestos', () => {
    expect(birthdayEvents(staff, 2026)[0]?.date).toBe('2026-02-28');
    expect(birthdayEvents(staff, 2028)[0]?.date).toBe('2028-02-29');
  });

  it('usa la fecha natural sin conversión y ocupa ese día en hora institucional', () => {
    const [, luis] = birthdayEvents(staff, 2026);
    expect(luis?.date).toBe('2026-03-10');
    expect(luis?.start.toISOString()).toBe('2026-03-10T06:00:00.000Z');
    expect(luis?.type).toBe('cumpleaños');
  });
});

describe('shiftCalendar', () => {
  it('lista por día y Turno a los Empleados activos con su horario de ese día de la semana', () => {
    // Del martes 10 (00:00 local) al miércoles 11 de marzo de 2026.
    const days = shiftCalendar(staff, d('2026-03-10T06:00:00Z'), d('2026-03-11T20:00:00Z'));
    expect(days.map((x) => x.date)).toEqual(['2026-03-10', '2026-03-11']);
    expect(days[0]?.shifts.matutino?.map((e) => e.userId)).toEqual([1]);
    expect(days[0]?.shifts.vespertino?.map((e) => e.userId)).toEqual([2]);
    expect(days[1]?.shifts.matutino?.map((e) => e.userId)).toEqual([5]);
    expect(days[0]?.shifts.matutino?.[0]?.startAt.toISOString()).toBe('2026-03-10T14:00:00.000Z');
  });

  it('los días del rango se toman en hora institucional', () => {
    // 05:00 UTC del 10 de marzo todavía es el 9 en México.
    expect(shiftCalendar(staff, d('2026-03-10T05:00:00Z'), d('2026-03-10T05:30:00Z')).map((x) => x.date)).toEqual(['2026-03-09']);
  });

  it('un Empleado solo ve su propio Turno y horario; el Administrador ve todos', () => {
    const own = shiftCalendarFor({ id: 2, role: 'NURSE' }, staff, d('2026-03-10T06:00:00Z'), d('2026-03-10T07:00:00Z'));
    expect(own[0]?.shifts).toEqual({ vespertino: [expect.objectContaining({ userId: 2 })] });
    const all = shiftCalendarFor({ id: 4, role: 'ADMIN' }, staff, d('2026-03-10T06:00:00Z'), d('2026-03-10T07:00:00Z'));
    expect(Object.keys(all[0]?.shifts ?? {})).toEqual(['matutino', 'vespertino']);
  });

  it('rechaza rangos de más de 366 días', () => {
    expect(() => shiftCalendar(staff, d('2026-01-01T12:00:00Z'), d('2027-06-01T12:00:00Z'))).toThrow(RangeError);
  });
});

const events: EventLike[] = [
  { id: 1, title: 'Junta', type: 'general', startAt: d('2026-03-10T16:00:00Z'), endAt: d('2026-03-10T17:00:00Z') },
  { id: 2, title: 'Simulacro', type: 'actividad', startAt: d('2026-03-12T16:00:00Z'), endAt: d('2026-03-12T18:00:00Z') },
  { id: 3, title: 'Entrega de material', type: 'entrega', startAt: d('2026-03-15T16:00:00Z'), endAt: d('2026-03-15T16:30:00Z') },
  { id: 4, title: 'Cita personal', type: 'agenda individual', startAt: d('2026-03-11T16:00:00Z'), endAt: d('2026-03-11T17:00:00Z') },
];
const delivery = (id: number, status: CalendarDeliveryLike['status'], iso: string): CalendarDeliveryLike => ({
  id,
  status,
  scheduledDate: d(iso),
  supplierName: 'Proveedor',
  productName: `Producto ${id}`,
  quantityRequested: 10,
});
const deliveries = [delivery(1, 'programada', '2026-03-13T15:00:00Z'), delivery(2, 'recibida', '2026-03-09T15:00:00Z'), delivery(3, 'cancelada', '2026-03-12T15:00:00Z')];
const range = { from: dayRange('2026-03-01').start, to: dayRange('2026-03-31').end };

describe('generalCalendar y activitiesCalendar', () => {
  it('el general incluye Eventos general, Días_Inhábiles, feriados y entregas programadas o recibidas', () => {
    const result = generalCalendar({
      ...range,
      events,
      nonWorkingDays: [{ id: 1, title: 'Aniversario', date: d('2026-03-20T00:00:00Z') }],
      holidays: [{ date: '2026-03-16', name: 'Natalicio de Benito Juárez' }],
      deliveries,
    });
    expect(ids(result)).toEqual(['delivery:2', 'event:1', 'delivery:1', 'holiday:2026-03-16', 'nonWorkingDay:1']);
    expect(result.find((x) => x.id === 'nonWorkingDay:1')?.date).toBe('2026-03-20');
  });

  it('el de actividades incluye Eventos actividad y entrega y las entregas visibles; nunca una cancelada', () => {
    expect(ids(activitiesCalendar({ ...range, events, deliveries }))).toEqual(['delivery:2', 'event:2', 'delivery:1', 'event:3']);
  });

  it('solo incluye lo que se solapa con el rango', () => {
    const narrow = { from: dayRange('2026-03-12').start, to: dayRange('2026-03-12').end };
    expect(ids(activitiesCalendar({ ...narrow, events, deliveries }))).toEqual(['event:2']);
  });

  it('una entrega lleva Proveedor, Producto y cantidad, con el color de entrega', () => {
    const e = fromDelivery(deliveries[0] as CalendarDeliveryLike);
    expect(e.delivery).toEqual({ status: 'programada', supplierName: 'Proveedor', productName: 'Producto 1', quantityRequested: 10 });
    expect(e.color).toBe(eventColor('entrega'));
  });
});

describe('upcomingWindow', () => {
  // 21:00 del 10 de marzo en México (03:00 UTC del 11): la ventana es del 10 al 17 de marzo, hora local.
  const today = d('2026-03-11T03:00:00Z');
  const item = (id: number, type: EventLike['type'], iso: string) => fromEvent({ id, title: `E${id}`, type, startAt: d(iso), endAt: d(iso) });

  it('incluye actividades, entregas y entregas programadas desde hoy hasta hoy + 7, en orden', () => {
    const items = [
      item(1, 'entrega', '2026-03-18T05:59:59.999Z'), // 17 de marzo 23:59 local: dentro
      item(2, 'actividad', '2026-03-10T06:00:00Z'), // 10 de marzo 00:00 local: dentro
      item(3, 'actividad', '2026-03-10T05:59:59Z'), // 9 de marzo local: fuera
      item(4, 'entrega', '2026-03-18T06:00:00Z'), // 18 de marzo local: fuera
      item(5, 'general', '2026-03-12T16:00:00Z'), // tipo no incluido
      fromDelivery(delivery(6, 'programada', '2026-03-12T15:00:00Z')),
      fromDelivery(delivery(7, 'recibida', '2026-03-12T15:00:00Z')),
      fromDelivery(delivery(8, 'cancelada', '2026-03-12T15:00:00Z')),
    ];
    expect(ids(upcomingWindow(items, today))).toEqual(['event:2', 'delivery:6', 'event:1']);
  });

  it('devuelve como máximo 50 y una lista vacía si nada cumple', () => {
    const many = Array.from({ length: 60 }, (_, i) => item(100 + i, 'actividad', '2026-03-12T16:00:00Z'));
    expect(upcomingWindow(many, today)).toHaveLength(50);
    expect(upcomingWindow([item(9, 'general', '2026-03-12T16:00:00Z')], today)).toEqual([]);
  });
});

describe('validateEvent', () => {
  const ok = { title: 'Junta', startAt: d('2026-03-10T16:00:00Z'), endAt: d('2026-03-10T16:00:00Z') };
  const fields = (input: Parameters<typeof validateEvent>[0]) => validateEvent(input).map((e) => e.field);

  it('acepta un título de 1 a 150 caracteres y fin igual o posterior al inicio', () => {
    expect(fields(ok)).toEqual([]);
    expect(fields({ ...ok, title: 'x'.repeat(150) })).toEqual([]);
  });

  it('rechaza título vacío, con solo espacios o de más de 150 caracteres', () => {
    expect(fields({ ...ok, title: '' })).toEqual(['title']);
    expect(fields({ ...ok, title: '   ' })).toEqual(['title']);
    expect(fields({ ...ok, title: 'x'.repeat(151) })).toEqual(['title']);
  });

  it('rechaza fechas ausentes y un fin anterior al inicio', () => {
    expect(fields({ title: 'Junta', startAt: undefined, endAt: null })).toEqual(['startAt', 'endAt']);
    expect(validateEvent({ ...ok, endAt: d('2026-03-10T15:59:59.999Z') })).toEqual([{ field: 'endAt', message: EVENT_MESSAGES.endBeforeStart }]);
  });

  it('limita la descripción a 500 caracteres', () => {
    expect(fields({ ...ok, description: 'x'.repeat(500) })).toEqual([]);
    expect(fields({ ...ok, description: 'x'.repeat(501) })).toEqual(['description']);
  });
});

describe('validateNonWorkingDay', () => {
  const existing = [{ id: 1, date: d('2026-03-20T00:00:00Z') }];
  const base = { title: 'Aniversario', description: '', date: d('2026-03-21T00:00:00Z') };

  it('acepta datos válidos y una fecha libre', () => {
    expect(validateNonWorkingDay(base, existing)).toEqual({ ok: true });
  });

  it('una fecha ya registrada para otro Día_Inhábil es 409; editar el mismo no lo es', () => {
    const dup = validateNonWorkingDay({ ...base, date: d('2026-03-20T00:00:00Z') }, existing);
    expect(dup.ok === false && dup.error.status).toBe(409);
    expect(validateNonWorkingDay({ ...base, id: 1, date: d('2026-03-20T00:00:00Z') }, existing)).toEqual({ ok: true });
  });

  it('compara la fecha natural, sin zona horaria', () => {
    // Misma fecha natural guardada con una hora distinta: sigue siendo duplicada.
    const dup = validateNonWorkingDay({ ...base, date: d('2026-03-20T23:00:00Z') }, existing);
    expect(dup.ok === false && dup.error.status).toBe(409);
  });

  it('rechaza con 400 un título o descripción inválidos, o la fecha ausente', () => {
    const bad = validateNonWorkingDay({ title: ' ', description: 'x'.repeat(501), date: null }, existing);
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.error.status).toBe(400);
      expect((bad.error as { errors?: { field: string }[] }).errors?.map((e) => e.field)).toEqual(['title', 'description', 'date']);
    }
  });
});
