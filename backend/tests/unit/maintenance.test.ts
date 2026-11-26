// Pruebas del modelo de apertura y cierre de mantenimientos (tarea 3.20, Req. 26.1–26.3).

import { describe, expect, it } from 'vitest';
import { MAINTENANCE_MESSAGES, closeMaintenance, openMaintenance, type MaintenanceState } from '../../src/domain/equipment';

const TODAY = new Date('2026-03-10T15:30:00Z');

function baseState(): MaintenanceState {
  return {
    equipment: [
      { id: 1, operationalStatus: 'disponible' },
      { id: 2, operationalStatus: 'en mantenimiento' },
    ],
    records: [
      { id: 1, equipmentId: 2, startDate: new Date('2026-03-01T08:00:00Z'), endDate: null, resultingStatus: null },
      { id: 2, equipmentId: 1, startDate: new Date('2026-02-01T08:00:00Z'), endDate: new Date('2026-02-03T08:00:00Z'), resultingStatus: 'disponible' },
    ],
  };
}

const expectError = (result: { ok: boolean; error?: { status: number; message: string } }, status: number, message: string) => {
  expect(result.ok).toBe(false);
  expect(result.error?.status).toBe(status);
  expect(result.error?.message).toBe(message);
};

describe('openMaintenance', () => {
  it('abre un registro en curso y deja el equipo "en mantenimiento"', () => {
    const state = baseState();
    const copy = structuredClone(state);
    const result = openMaintenance(state, { equipmentId: 1, startDate: TODAY }, TODAY);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record).toEqual({ id: 3, equipmentId: 1, startDate: TODAY, endDate: null, resultingStatus: null });
    expect(result.value.state.equipment.find((e) => e.id === 1)?.operationalStatus).toBe('en mantenimiento');
    expect(state).toEqual(copy);
  });

  it('rechaza con 409 abrir un segundo mantenimiento en curso, sin cambios', () => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(openMaintenance(state, { equipmentId: 2, startDate: TODAY }, TODAY), 409, MAINTENANCE_MESSAGES.alreadyOpen);
    expect(state).toEqual(copy);
  });

  it('rechaza con 400 una fecha de inicio posterior a hoy', () => {
    const result = openMaintenance(baseState(), { equipmentId: 1, startDate: new Date(TODAY.getTime() + 1) }, TODAY);
    expectError(result, 400, MAINTENANCE_MESSAGES.startDateInFuture);
  });

  it('devuelve 404 si el equipo no existe', () => {
    expectError(openMaintenance(baseState(), { equipmentId: 99, startDate: TODAY }, TODAY), 404, MAINTENANCE_MESSAGES.equipmentNotFound);
  });
});

describe('closeMaintenance', () => {
  it.each(['disponible', 'fuera de servicio'] as const)('cierra un registro en curso y deja el equipo "%s"', (resultingStatus) => {
    const state = baseState();
    const copy = structuredClone(state);
    const endDate = new Date('2026-03-05T10:00:00Z');
    const result = closeMaintenance(state, { recordId: 1, endDate, resultingStatus });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record).toMatchObject({ id: 1, endDate, resultingStatus });
    expect(result.value.state.equipment.find((e) => e.id === 2)?.operationalStatus).toBe(resultingStatus);
    expect(state).toEqual(copy);
  });

  it('acepta una fecha de fin igual a la de inicio y rechaza con 400 una anterior', () => {
    expect(closeMaintenance(baseState(), { recordId: 1, endDate: new Date('2026-03-01T08:00:00Z'), resultingStatus: 'disponible' }).ok).toBe(true);
    expectError(
      closeMaintenance(baseState(), { recordId: 1, endDate: new Date('2026-03-01T07:59:59.999Z'), resultingStatus: 'disponible' }),
      400,
      MAINTENANCE_MESSAGES.endDateBeforeStart,
    );
  });

  it('rechaza con 409 cerrar un registro ya cerrado, sin cambios', () => {
    const state = baseState();
    const copy = structuredClone(state);
    expectError(closeMaintenance(state, { recordId: 2, endDate: TODAY, resultingStatus: 'disponible' }), 409, MAINTENANCE_MESSAGES.alreadyClosed);
    expect(state).toEqual(copy);
  });

  it.each(['en uso', 'en mantenimiento', 'Disponible', '', null])('rechaza con 400 el estado resultante %j', (resultingStatus) => {
    expectError(closeMaintenance(baseState(), { recordId: 1, endDate: TODAY, resultingStatus }), 400, MAINTENANCE_MESSAGES.invalidResultingStatus);
  });

  it('devuelve 404 si el registro no existe', () => {
    expectError(closeMaintenance(baseState(), { recordId: 99, endDate: TODAY, resultingStatus: 'disponible' }), 404, MAINTENANCE_MESSAGES.recordNotFound);
  });

  it('después de cerrar se puede abrir un nuevo mantenimiento', () => {
    const closed = closeMaintenance(baseState(), { recordId: 1, endDate: TODAY, resultingStatus: 'disponible' });
    if (!closed.ok) throw new Error('cierre rechazado');
    expect(openMaintenance(closed.value.state, { equipmentId: 2, startDate: TODAY }, TODAY).ok).toBe(true);
  });
});
