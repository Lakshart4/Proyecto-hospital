import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { changePatientStatus, readmitPatient } from '../api';
import { localToday, readmissionFormSchema, type ReadmissionFormValues } from '../schemas';
import type { Department, Patient } from '../types';
import { toDateTimeInput, toIsoDateTime } from '../utils';

export interface PatientStatusDialogProps {
  patient: Patient;
  action: 'alta' | 'fallecimiento';
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function PatientStatusDialog({ patient, action, onClose, onSaved }: PatientStatusDialogProps) {
  const death = action === 'fallecimiento';
  const [deceasedAt, setDeceasedAt] = useState(toDateTimeInput());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<FieldErrors<'deceasedAt' | 'note' | 'status'>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FieldErrors<'deceasedAt' | 'note' | 'status'> = {};
    if (death) {
      const time = new Date(deceasedAt).getTime();
      const admission = new Date(patient.admissionDate).getTime();
      if (!deceasedAt || Number.isNaN(time)) nextErrors.deceasedAt = 'Ingresa una fecha y hora válidas.';
      else if (time > Date.now() || time < admission) nextErrors.deceasedAt = 'Debe estar entre el último ingreso y el momento actual.';
    }
    if (note.length > 500) nextErrors.note = 'Debe tener como máximo 500 caracteres.';
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      await changePatientStatus(patient.id, {
        status: death ? 'fallecido' : 'dado de alta',
        deceasedAt: death ? toIsoDateTime(deceasedAt) : null,
        note: note.trim(),
      });
      onSaved(death ? 'Se registró el fallecimiento del paciente.' : 'Paciente dado de alta correctamente.');
    } catch (reason) {
      const mapped = mapApiError(reason, ['deceasedAt', 'note', 'status'] as const);
      setErrors(mapped.fieldErrors);
      setError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={death ? 'Registrar fallecimiento' : 'Dar de alta al paciente'} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">Esta acción cierra la asignación de habitación activa y agrega el movimiento correspondiente al historial.</p>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {death && (
          <FormField id="patient-deceasedAt" label="Fecha y hora de fallecimiento" error={errors.deceasedAt} required>
            <input type="datetime-local" value={deceasedAt} max={toDateTimeInput()} onChange={(event) => setDeceasedAt(event.target.value)} disabled={saving} className={INPUT_CLASSES} />
          </FormField>
        )}
        <FormField id="patient-status-note" label="Nota del movimiento (opcional)" error={errors.note} hint={`${note.length}/500 caracteres`}>
          <textarea rows={4} value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" variant={death ? 'danger' : 'primary'} loading={saving}>{death ? 'Registrar fallecimiento' : 'Confirmar alta'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export interface ReadmissionDialogProps {
  patient: Patient;
  departments: readonly Department[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ReadmissionDialog({ patient, departments, onClose, onSaved }: ReadmissionDialogProps) {
  const [values, setValues] = useState<ReadmissionFormValues>({ admissionDate: localToday(), departmentId: String(patient.departmentId), reason: '' });
  const [errors, setErrors] = useState<FieldErrors<keyof ReadmissionFormValues & string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const checked = validateForm(readmissionFormSchema, values);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      return;
    }
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      await readmitPatient(patient.id, {
        admissionDate: checked.data.admissionDate,
        departmentId: Number(checked.data.departmentId),
        reason: checked.data.reason.trim(),
      });
      onSaved('Reingreso registrado correctamente.');
    } catch (reason) {
      const mapped = mapApiError(reason, ['admissionDate', 'departmentId', 'reason'] as const);
      setErrors(mapped.fieldErrors);
      setError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title="Registrar reingreso" onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <FormField id="readmission-date" label="Fecha de reingreso" error={errors.admissionDate} required>
          <input type="date" value={values.admissionDate} max={localToday()} onChange={(event) => setValues((current) => ({ ...current, admissionDate: event.target.value }))} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="readmission-department" label="Departamento" error={errors.departmentId} required>
          <select value={values.departmentId} onChange={(event) => setValues((current) => ({ ...current, departmentId: event.target.value }))} disabled={saving} className={INPUT_CLASSES}>
            <option value="">Selecciona un departamento</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </FormField>
        <FormField id="readmission-reason" label="Motivo del reingreso" error={errors.reason} hint={`${values.reason.length}/500 caracteres`} required>
          <textarea rows={4} value={values.reason} maxLength={500} onChange={(event) => setValues((current) => ({ ...current, reason: event.target.value }))} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving}>Registrar reingreso</Button>
        </div>
      </form>
    </Modal>
  );
}
