// Pruebas de permisos y alcance (tarea 4.6). Las propiedades 4, 7, 9, 10, 13, 15 y 35 están en tests/property.

import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  OWN_PROFILE_EDITABLE_FIELDS,
  RESOURCES,
  RESPONSIBLE_MESSAGES,
  can,
  canAccessPatient,
  canEditOwnProfile,
  canManageAgenda,
  canReadAgenda,
  canUpdatePatientField,
  canWriteEvent,
  inventoryScope,
  patientScope,
  validateResponsibles,
} from '../../src/domain/permissions';
import { inventoryScope as stockInventoryScope } from '../../src/domain/stock';

describe('can', () => {
  it('ADMIN accede a todos los recursos y acciones', () => {
    for (const resource of RESOURCES) for (const action of ACTIONS) expect(can('ADMIN', resource, action)).toBe(true);
  });

  it('CLEANING solo lee cleaningInventory y no lo modifica; no accede al inventario médico', () => {
    expect(can('CLEANING', 'cleaningInventory', 'list')).toBe(true);
    expect(can('CLEANING', 'cleaningInventory', 'read')).toBe(true);
    for (const action of ['create', 'update', 'delete'] as const) expect(can('CLEANING', 'cleaningInventory', action)).toBe(false);
    for (const action of ACTIONS) expect(can('CLEANING', 'inventory', action)).toBe(false);
    for (const action of ACTIONS) expect(can('CLEANING', 'patients', action)).toBe(false);
  });

  it('DOCTOR y NURSE leen Pacientes pero no los crean, editan ni eliminan', () => {
    for (const role of ['DOCTOR', 'NURSE'] as const) {
      expect(can(role, 'patients', 'list')).toBe(true);
      expect(can(role, 'patients', 'read')).toBe(true);
      for (const action of ['create', 'update', 'delete'] as const) expect(can(role, 'patients', action)).toBe(false);
    }
  });

  it('tratamientos: DOCTOR crea y edita, NURSE solo actualiza, ninguno elimina', () => {
    expect(can('DOCTOR', 'patientTreatments', 'create')).toBe(true);
    expect(can('DOCTOR', 'patientTreatments', 'update')).toBe(true);
    expect(can('NURSE', 'patientTreatments', 'create')).toBe(false);
    expect(can('NURSE', 'patientTreatments', 'update')).toBe(true);
    expect(can('DOCTOR', 'patientTreatments', 'delete')).toBe(false);
  });

  it('ningún rol distinto de ADMIN accede a los módulos administrativos', () => {
    const adminOnly = ['staff', 'employeeDocuments', 'dashboard', 'audit', 'equipment', 'maintenance', 'rooms', 'occupancy', 'suppliers', 'deliveries', 'inventoryMovements', 'inventory', 'adminAuthorization'] as const;
    for (const role of ['DOCTOR', 'NURSE', 'CLEANING'] as const) {
      for (const resource of adminOnly) for (const action of ACTIONS) expect(can(role, resource, action)).toBe(false);
    }
  });
});

describe('alcance de Pacientes', () => {
  const patients = [
    { id: 1, doctorId: 10, nurseId: 20 },
    { id: 2, doctorId: 11, nurseId: 20 },
    { id: 3, doctorId: 10, nurseId: 21 },
  ];

  it('DOCTOR ve los suyos como médico, NURSE los suyos como enfermero, ADMIN todos y CLEANING se deniega', () => {
    expect(patientScope({ id: 10, role: 'DOCTOR' }, patients)).toEqual([patients[0], patients[2]]);
    expect(patientScope({ id: 20, role: 'NURSE' }, patients)).toEqual([patients[0], patients[1]]);
    expect(patientScope({ id: 20, role: 'DOCTOR' }, patients)).toEqual([]);
    expect(patientScope({ id: 1, role: 'ADMIN' }, patients)).toEqual(patients);
    expect(patientScope({ id: 10, role: 'CLEANING' }, patients)).toBe('DENIED');
  });

  it('el acceso individual coincide con el alcance', () => {
    expect(canAccessPatient({ id: 11, role: 'DOCTOR' }, patients[0]!)).toBe(false);
    expect(canAccessPatient({ id: 21, role: 'NURSE' }, patients[2]!)).toBe(true);
    expect(canAccessPatient({ id: 10, role: 'CLEANING' }, patients[0]!)).toBe(false);
  });
});

describe('validateResponsibles', () => {
  const users = [
    { id: 1, role: 'ADMIN' as const },
    { id: 2, role: 'DOCTOR' as const },
    { id: 3, role: 'NURSE' as const },
    { id: 4, role: 'CLEANING' as const },
  ];

  it('acepta un médico con rol DOCTOR y un enfermero con rol NURSE', () => {
    expect(validateResponsibles(users, { doctorId: 2, nurseId: 3 })).toEqual([]);
    expect(validateResponsibles(users, {})).toEqual([]);
  });

  it('rechaza rol incorrecto o usuario inexistente con mensajes por campo', () => {
    expect(validateResponsibles(users, { doctorId: 3, nurseId: 2 })).toEqual([
      { field: 'doctorId', message: RESPONSIBLE_MESSAGES.doctor },
      { field: 'nurseId', message: RESPONSIBLE_MESSAGES.nurse },
    ]);
    expect(validateResponsibles(users, { doctorId: 99 })).toEqual([{ field: 'doctorId', message: RESPONSIBLE_MESSAGES.doctor }]);
    expect(validateResponsibles(users, { nurseId: 4 })).toEqual([{ field: 'nurseId', message: RESPONSIBLE_MESSAGES.nurse }]);
  });
});

describe('canUpdatePatientField', () => {
  it('un Médico no responsable recibe FORBIDDEN', () => {
    expect(canUpdatePatientField({ role: 'DOCTOR', isResponsible: false, patientStatus: 'activo', field: 'medicalObservation' })).toBe('FORBIDDEN');
  });

  it('un responsable sobre un Paciente dado de alta o fallecido recibe CONFLICT', () => {
    expect(canUpdatePatientField({ role: 'DOCTOR', isResponsible: true, patientStatus: 'dado de alta', field: 'medicalObservation' })).toBe('CONFLICT');
    expect(canUpdatePatientField({ role: 'NURSE', isResponsible: true, patientStatus: 'fallecido', field: 'nursingObservation' })).toBe('CONFLICT');
  });

  it('cada rol solo su observación; el otro rol recibe FORBIDDEN aunque sea responsable', () => {
    expect(canUpdatePatientField({ role: 'DOCTOR', isResponsible: true, patientStatus: 'activo', field: 'medicalObservation' })).toBe('ALLOW');
    expect(canUpdatePatientField({ role: 'NURSE', isResponsible: true, patientStatus: 'activo', field: 'medicalObservation' })).toBe('FORBIDDEN');
    expect(canUpdatePatientField({ role: 'DOCTOR', isResponsible: true, patientStatus: 'activo', field: 'nursingObservation' })).toBe('FORBIDDEN');
  });

  it('tratamientos: el Médico registra, edita y cancela; ambos marcan realizado solo uno programado', () => {
    const base = { isResponsible: true, patientStatus: 'activo' as const, field: 'treatment' as const };
    for (const action of ['create', 'edit', 'cancel'] as const) {
      expect(canUpdatePatientField({ ...base, role: 'DOCTOR', treatmentTransition: { action } })).toBe('ALLOW');
      expect(canUpdatePatientField({ ...base, role: 'NURSE', treatmentTransition: { action } })).toBe('FORBIDDEN');
    }
    for (const role of ['DOCTOR', 'NURSE'] as const) {
      expect(canUpdatePatientField({ ...base, role, treatmentTransition: { action: 'markDone', from: 'programado' } })).toBe('ALLOW');
      expect(canUpdatePatientField({ ...base, role, treatmentTransition: { action: 'markDone', from: 'realizado' } })).toBe('FORBIDDEN');
      expect(canUpdatePatientField({ ...base, role, treatmentTransition: { action: 'markDone', from: 'cancelado' } })).toBe('FORBIDDEN');
    }
    expect(canUpdatePatientField({ ...base, role: 'DOCTOR' })).toBe('FORBIDDEN');
  });

  it('datos generales, Departamento, responsables, estado y fecha de ingreso: FORBIDDEN para Médicos y Enfermeros', () => {
    for (const field of ['generalData', 'department', 'responsibles', 'status', 'admissionDate'] as const) {
      for (const role of ['DOCTOR', 'NURSE'] as const) {
        expect(canUpdatePatientField({ role, isResponsible: true, patientStatus: 'activo', field })).toBe('FORBIDDEN');
      }
    }
  });
});

describe('canEditOwnProfile', () => {
  it('acepta solo las cuatro claves aprobadas', () => {
    expect(OWN_PROFILE_EDITABLE_FIELDS).toEqual(['photoUrl', 'phone', 'password', 'schedule']);
    expect(canEditOwnProfile(Object.fromEntries(OWN_PROFILE_EDITABLE_FIELDS.map((key) => [key, 'v'])))).toBe(true);
    expect(canEditOwnProfile({})).toBe(true);
  });

  it('rechaza cualquier otra clave o un cuerpo que no es objeto', () => {
    for (const key of ['position', 'description', 'email', 'internalId', 'departmentId', 'role', 'yearsExperience', 'shift']) {
      expect(canEditOwnProfile({ phone: '1', [key]: 'x' })).toBe(false);
    }
    for (const body of [null, undefined, 'phone', 1, ['phone']]) expect(canEditOwnProfile(body)).toBe(false);
  });
});

describe('agenda individual', () => {
  it('solo el propietario crea, edita o elimina; consulta el propietario o un ADMIN', () => {
    expect(canManageAgenda({ id: 5, role: 'DOCTOR' }, 5)).toBe(true);
    expect(canManageAgenda({ id: 5, role: 'DOCTOR' }, 6)).toBe(false);
    expect(canManageAgenda({ id: 1, role: 'ADMIN' }, 6)).toBe(false);
    expect(canReadAgenda({ id: 1, role: 'ADMIN' }, 6)).toBe(true);
    expect(canReadAgenda({ id: 5, role: 'NURSE' }, 6)).toBe(false);
  });

  it('eventos generales, de actividad y de entrega solo los escribe el ADMIN', () => {
    for (const type of ['general', 'actividad', 'entrega'] as const) {
      expect(canWriteEvent({ id: 1, role: 'ADMIN' }, { type, ownerId: null })).toBe(true);
      expect(canWriteEvent({ id: 5, role: 'DOCTOR' }, { type, ownerId: null })).toBe(false);
    }
    expect(canWriteEvent({ id: 5, role: 'CLEANING' }, { type: 'agenda individual', ownerId: 5 })).toBe(true);
    expect(canWriteEvent({ id: 1, role: 'ADMIN' }, { type: 'agenda individual', ownerId: 5 })).toBe(false);
    expect(canWriteEvent({ id: 5, role: 'DOCTOR' }, { type: 'agenda individual', ownerId: null })).toBe(false);
  });
});

it('inventoryScope se reexporta sin duplicarse', () => {
  expect(inventoryScope).toBe(stockInventoryScope);
});
