// Pruebas de las reglas puras del estado del Paciente (tarea 3.12).
// Las propiedades 11 y 12 corresponden a tareas posteriores.

import { describe, expect, it } from 'vitest';
import { PATIENT_STATUSES } from '../../src/domain/constants';
import { fullName, nextPatientStatus, searchPatients, validDeathTime, type PatientAction } from '../../src/domain/patients';

describe('nextPatientStatus', () => {
  it('permite alta y fallecimiento desde "activo" y reingreso desde "dado de alta"', () => {
    expect(nextPatientStatus('activo', 'alta')).toBe('dado de alta');
    expect(nextPatientStatus('activo', 'fallecimiento')).toBe('fallecido');
    expect(nextPatientStatus('dado de alta', 'reingreso')).toBe('activo');
  });

  it.each(['alta', 'fallecimiento', 'reingreso'] as const)('"fallecido" con "%s" devuelve CONFLICT', (action) => {
    expect(nextPatientStatus('fallecido', action)).toBe('CONFLICT');
  });

  it('rechaza las demás combinaciones', () => {
    expect(nextPatientStatus('activo', 'reingreso')).toBe('CONFLICT');
    expect(nextPatientStatus('dado de alta', 'alta')).toBe('CONFLICT');
    expect(nextPatientStatus('dado de alta', 'fallecimiento')).toBe('CONFLICT');
  });

  it('cubre las 9 combinaciones con exactamente 3 transiciones permitidas', () => {
    const actions: PatientAction[] = ['alta', 'fallecimiento', 'reingreso'];
    const allowed = PATIENT_STATUSES.flatMap((s) => actions.map((a) => nextPatientStatus(s, a))).filter((r) => r !== 'CONFLICT');
    expect(allowed).toHaveLength(3);
  });
});

describe('validDeathTime', () => {
  const admission = new Date('2026-03-01T08:00:00Z');
  const now = new Date('2026-03-10T15:30:00Z');

  it('acepta un instante entre el último ingreso y ahora, incluidos ambos límites', () => {
    expect(validDeathTime(new Date('2026-03-05T12:00:00Z'), admission, now)).toBe(true);
    expect(validDeathTime(admission, admission, now)).toBe(true);
    expect(validDeathTime(now, admission, now)).toBe(true);
  });

  it('rechaza un fallecimiento anterior al último ingreso', () => {
    expect(validDeathTime(new Date('2026-03-01T07:59:59.999Z'), admission, now)).toBe(false);
  });

  it('rechaza un fallecimiento posterior a ahora', () => {
    expect(validDeathTime(new Date('2026-03-10T15:30:00.001Z'), admission, now)).toBe(false);
  });

  it('lanza RangeError con fechas inválidas', () => {
    const invalid = new Date('no es fecha');
    expect(() => validDeathTime(invalid, admission, now)).toThrow(RangeError);
    expect(() => validDeathTime(now, invalid, now)).toThrow(RangeError);
    expect(() => validDeathTime(now, admission, invalid)).toThrow(RangeError);
  });
});

describe('searchPatients', () => {
  const patients = [
    { id: 1, firstName: 'Ángela', lastName: 'Ruiz Peña', internalId: 'PAC-001', admissionDate: new Date('2026-02-01T10:00:00Z') },
    { id: 2, firstName: 'Luis', lastName: 'Ortega', internalId: 'PAC-002', admissionDate: new Date('2026-03-05T10:00:00Z') },
    { id: 3, firstName: 'María', lastName: 'Gómez', internalId: 'URG-010', admissionDate: new Date('2026-01-15T10:00:00Z') },
    { id: 4, firstName: 'Ana', lastName: 'Ruiz', internalId: 'PAC-004', admissionDate: new Date('2026-03-05T10:00:00Z') },
  ];
  const ids = (list: { id: number }[]) => list.map((p) => p.id);

  it('sin término devuelve todos ordenados por ingreso descendente, con empates en orden de entrada', () => {
    expect(ids(searchPatients(patients, undefined))).toEqual([2, 4, 1, 3]);
    expect(ids(searchPatients(patients, '   '))).toEqual([2, 4, 1, 3]);
  });

  it('busca por nombre, apellido o nombre completo sin distinguir mayúsculas', () => {
    expect(ids(searchPatients(patients, 'ÁNGELA'))).toEqual([1]);
    expect(ids(searchPatients(patients, 'ruiz'))).toEqual([4, 1]);
    expect(ids(searchPatients(patients, 'ángela ruiz'))).toEqual([1]);
    expect(ids(searchPatients(patients, 'PEÑA'))).toEqual([1]);
  });

  it('busca por ID interno sin distinguir mayúsculas', () => {
    expect(ids(searchPatients(patients, 'pac-00'))).toEqual([2, 4, 1]);
    expect(ids(searchPatients(patients, 'urg'))).toEqual([3]);
  });

  it('sin coincidencias devuelve una lista vacía', () => {
    expect(searchPatients(patients, 'zzz')).toEqual([]);
  });

  it('no modifica la lista recibida', () => {
    const copy = structuredClone(patients);
    searchPatients(patients, 'ruiz');
    expect(patients).toEqual(copy);
  });

  it('fullName une nombre y apellidos', () => {
    expect(fullName({ firstName: 'Ana', lastName: 'Ruiz' })).toBe('Ana Ruiz');
  });
});
