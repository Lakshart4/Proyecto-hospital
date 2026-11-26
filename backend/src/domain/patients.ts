// Reglas puras del estado del Paciente (Req. 6.5, 6.13, 20.2–20.5).
//
// `nextPatientStatus` define las transiciones permitidas: alta y fallecimiento solo desde "activo",
// reingreso solo desde "dado de alta"; "fallecido" es definitivo. Cualquier otra combinación es un
// conflicto (409). `validDeathTime` valida la fecha y hora de fallecimiento. `searchPatients` aplica la
// búsqueda por nombre o ID interno y el orden por fecha de ingreso descendente de la lista de Pacientes.

import type { PatientStatus } from './constants';
import { applyFilters, search } from './filters';

export type PatientAction = 'alta' | 'fallecimiento' | 'reingreso';

/** Transiciones permitidas: estado de origen y acción → estado resultante. */
const TRANSITIONS: Readonly<Record<PatientAction, { from: PatientStatus; to: PatientStatus }>> = {
  alta: { from: 'activo', to: 'dado de alta' },
  fallecimiento: { from: 'activo', to: 'fallecido' },
  reingreso: { from: 'dado de alta', to: 'activo' },
};

/**
 * Estado resultante de aplicar una acción al Paciente, o 'CONFLICT' si la transición no está permitida
 * (Req. 20.4, 20.5). Un Paciente "fallecido" nunca cambia de estado.
 */
export function nextPatientStatus(from: PatientStatus, action: PatientAction): PatientStatus | 'CONFLICT' {
  const transition = TRANSITIONS[action];
  return transition.from === from ? transition.to : 'CONFLICT';
}

function assertValidDate(name: string, value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new RangeError(`${name} no es una fecha válida.`);
}

/**
 * La fecha y hora de fallecimiento es válida si no es posterior a `now` ni anterior al último ingreso;
 * ambos límites están incluidos (Req. 20.3).
 * @throws RangeError si alguna fecha no es válida.
 */
export function validDeathTime(deathAt: Date, lastAdmission: Date, now: Date): boolean {
  assertValidDate('deathAt', deathAt);
  assertValidDate('lastAdmission', lastAdmission);
  assertValidDate('now', now);
  return deathAt.getTime() <= now.getTime() && deathAt.getTime() >= lastAdmission.getTime();
}

export interface PatientSearchLike {
  firstName: string;
  lastName: string;
  internalId: string;
  admissionDate: Date;
}

/** Nombre completo del Paciente, tal como se busca: "nombre apellidos". */
export const fullName = (patient: Pick<PatientSearchLike, 'firstName' | 'lastName'>) => `${patient.firstName} ${patient.lastName}`;

/**
 * Pacientes cuyo nombre completo o ID interno contiene el término, sin distinguir mayúsculas, ordenados
 * por fecha de ingreso descendente (Req. 6.5). Sin término (o solo espacios) devuelve todos, ordenados.
 * Los empates de fecha conservan el orden de entrada. No modifica la lista recibida.
 */
export function searchPatients<T extends PatientSearchLike>(patients: readonly T[], term: string | undefined): T[] {
  return applyFilters(patients, [search((p: T) => [fullName(p), p.internalId], term)]).sort(
    (a, b) => b.admissionDate.getTime() - a.admissionDate.getTime(),
  );
}
