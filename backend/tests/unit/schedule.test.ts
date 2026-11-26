// Pruebas de validateDaySchedule (tarea 3.21, Req. 5.15, 5.16).
// La propiedad 25 corresponde a la tarea 3.22.

import { describe, expect, it } from 'vitest';
import { parseTime, validateDaySchedule, type DaySchedule } from '../../src/domain/schedule';

const day = (values: Partial<DaySchedule> = {}): DaySchedule => ({
  startTime: '08:00',
  endTime: '16:00',
  mealStart: '13:00',
  mealEnd: '14:00',
  breaks: [{ startTime: '10:00', endTime: '10:15' }],
  ...values,
});
const fields = (d: DaySchedule) => validateDaySchedule(d).map((e) => e.field);

describe('parseTime', () => {
  it('convierte HH:mm en minutos y rechaza otros formatos', () => {
    expect(parseTime('00:00')).toBe(0);
    expect(parseTime('23:59')).toBe(1439);
    for (const bad of ['24:00', '8:00', '08:0', '08:60', '08-00', '', ' 08:00', null, 800]) expect(parseTime(bad)).toBeNull();
  });
});

describe('validateDaySchedule', () => {
  it('acepta un día válido, sin comida y sin descansos', () => {
    expect(validateDaySchedule(day())).toEqual([]);
    expect(validateDaySchedule(day({ mealStart: null, mealEnd: null, breaks: [] }))).toEqual([]);
  });

  it('acepta comida y descansos que tocan los extremos del horario o entre sí', () => {
    expect(
      validateDaySchedule(
        day({
          mealStart: '08:00',
          mealEnd: '09:00',
          breaks: [
            { startTime: '09:00', endTime: '09:15' },
            { startTime: '09:15', endTime: '09:30' },
            { startTime: '15:45', endTime: '16:00' },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it('identifica las horas con formato inválido', () => {
    expect(fields(day({ startTime: '8:00' }))).toEqual(['startTime']);
    expect(fields(day({ breaks: [{ startTime: '10:00', endTime: '25:00' }] }))).toEqual(['breaks.0.endTime']);
  });

  it('exige una salida posterior a la entrada', () => {
    expect(fields(day({ startTime: '16:00', endTime: '16:00', mealStart: null, mealEnd: null, breaks: [] }))).toEqual(['endTime']);
    expect(fields(day({ startTime: '17:00', endTime: '08:00', mealStart: null, mealEnd: null, breaks: [] }))).toEqual(['endTime']);
  });

  it('valida la comida: completa, ordenada y dentro del horario', () => {
    expect(fields(day({ mealEnd: null }))).toEqual(['mealEnd']);
    expect(fields(day({ mealStart: null }))).toEqual(['mealStart']);
    expect(fields(day({ mealStart: '14:00', mealEnd: '13:00' }))).toEqual(['mealEnd']);
    expect(fields(day({ mealStart: '15:30', mealEnd: '16:30' }))).toEqual(['mealStart']);
  });

  it('admite como máximo 3 descansos', () => {
    const four = ['09:00', '10:00', '11:00', '12:00'].map((h) => ({ startTime: h, endTime: h.replace(':00', ':10') }));
    expect(fields(day({ breaks: four }))).toEqual(['breaks']);
  });

  it('cada descanso debe tener inicio anterior al fin y estar dentro del horario', () => {
    expect(fields(day({ breaks: [{ startTime: '10:15', endTime: '10:00' }] }))).toEqual(['breaks.0.endTime']);
    expect(fields(day({ breaks: [{ startTime: '07:50', endTime: '08:10' }] }))).toEqual(['breaks.0']);
  });

  it('un descanso que se solapa con la comida produce un error en ese descanso', () => {
    const errors = validateDaySchedule(day({ breaks: [{ startTime: '13:30', endTime: '13:45' }] }));
    expect(errors).toEqual([{ field: 'breaks.0', message: 'El descanso se solapa con el periodo de comida.' }]);
  });

  it('un descanso que se solapa con otro produce un error en el segundo', () => {
    expect(
      fields(
        day({
          breaks: [
            { startTime: '10:00', endTime: '10:30' },
            { startTime: '10:20', endTime: '10:40' },
          ],
        }),
      ),
    ).toEqual(['breaks.1']);
  });

  it('no modifica el día recibido', () => {
    const d = day();
    const copy = structuredClone(d);
    validateDaySchedule(d);
    expect(d).toEqual(copy);
  });
});
