import type { Patient, PatientStatus, TreatmentStatus, TreatmentType } from './types';

export const PATIENT_STATUS_LABELS: Record<PatientStatus, string> = {
  activo: 'Activo',
  'dado de alta': 'Dado de alta',
  fallecido: 'Fallecido',
};

export const TREATMENT_TYPE_LABELS: Record<TreatmentType, string> = {
  tratamiento: 'Tratamiento',
  cirugía: 'Cirugía',
};

export const TREATMENT_STATUS_LABELS: Record<TreatmentStatus, string> = {
  programado: 'Programado',
  realizado: 'Realizado',
  cancelado: 'Cancelado',
};

export function patientFullName(patient: Pick<Patient, 'firstName' | 'lastName'>): string {
  return `${patient.firstName} ${patient.lastName}`.trim();
}

export function toDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

export function toDateTimeInput(value?: string | Date | null): string {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function toIsoDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}
