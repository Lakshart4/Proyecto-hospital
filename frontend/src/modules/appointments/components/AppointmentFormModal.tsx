import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import type { Patient, StaffOption } from '../../patients/types';
import { createAppointment, updateAppointment } from '../api';
import type { Appointment } from '../types';

const FIELDS = ['patientId', 'doctorId', 'scheduledAt', 'durationMinutes', 'reason', 'notes'] as const;
type Field = (typeof FIELDS)[number];
const schema = z.object({
  patientId: z.string().min(1, 'Selecciona un paciente.'),
  doctorId: z.string().min(1, 'Selecciona un médico.'),
  scheduledAt: z.string().min(1, 'Indica la fecha y hora.').refine((value) => new Date(value).getTime() > Date.now(), 'Selecciona una fecha y hora futuras.'),
  durationMinutes: z.string().regex(/^\d+$/, 'Indica una duración válida.').refine((value) => Number(value) >= 10 && Number(value) <= 240, 'Entre 10 y 240 minutos.'),
  reason: z.string().trim().min(1, 'El motivo es obligatorio.').max(500, 'Máximo 500 caracteres.'),
  notes: z.string().max(1000, 'Máximo 1000 caracteres.'),
});

function localInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export interface AppointmentFormModalProps {
  appointment: Appointment | null;
  patients: readonly Patient[];
  doctors: readonly StaffOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function AppointmentFormModal({ appointment, patients, doctors, onClose, onSaved }: AppointmentFormModalProps) {
  const [values, setValues] = useState({
    patientId: appointment ? String(appointment.patientId) : '',
    doctorId: appointment ? String(appointment.doctorId) : doctors.length === 1 ? String(doctors[0]!.id) : '',
    scheduledAt: appointment ? localInput(new Date(appointment.scheduledAt)) : localInput(new Date(Date.now() + 86_400_000)),
    durationMinutes: appointment ? String(appointment.durationMinutes) : '30',
    reason: appointment?.reason ?? '',
    notes: appointment?.notes ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<Field>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (field: Field, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const checked = validateForm(schema, values);
    if (!checked.ok) { setErrors(checked.fieldErrors); return; }
    setSaving(true); setError(null); setErrors({});
    try {
      const payload = {
        patientId: Number(checked.data.patientId), doctorId: Number(checked.data.doctorId),
        scheduledAt: new Date(checked.data.scheduledAt).toISOString(), durationMinutes: Number(checked.data.durationMinutes),
        reason: checked.data.reason.trim(), notes: checked.data.notes.trim(),
      };
      if (appointment) await updateAppointment(appointment.id, payload);
      else await createAppointment(payload);
      onSaved(appointment ? 'Cita actualizada correctamente.' : 'Cita creada correctamente.');
    } catch (reason) {
      const mapped = mapApiError(reason, FIELDS);
      setErrors(mapped.fieldErrors);
      setError(mapped.formError);
    } finally { setSaving(false); }
  };

  return (
    <Modal open title={appointment ? 'Editar cita médica' : 'Nueva cita médica'} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">{error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}</div>
        <FormField id="appointment-patient" label="Paciente" error={errors.patientId} required>
          <select value={values.patientId} onChange={(event) => set('patientId', event.target.value)} disabled={saving} className={INPUT_CLASSES}>
            <option value="">Selecciona un paciente activo</option>
            {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName} · {patient.internalId}</option>)}
          </select>
        </FormField>
        <FormField id="appointment-doctor" label="Médico" error={errors.doctorId} required>
          <select value={values.doctorId} onChange={(event) => set('doctorId', event.target.value)} disabled={saving || doctors.length === 1} className={INPUT_CLASSES}>
            <option value="">Selecciona un médico</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
          </select>
        </FormField>
        <FormField id="appointment-date" label="Fecha y hora" error={errors.scheduledAt} required>
          <input type="datetime-local" value={values.scheduledAt} onChange={(event) => set('scheduledAt', event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="appointment-duration" label="Duración (minutos)" error={errors.durationMinutes} required>
          <input type="number" min={10} max={240} step={5} value={values.durationMinutes} onChange={(event) => set('durationMinutes', event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <div className="sm:col-span-2"><FormField id="appointment-reason" label="Motivo de la cita" error={errors.reason} required>
          <textarea rows={3} maxLength={500} value={values.reason} onChange={(event) => set('reason', event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField></div>
        <div className="sm:col-span-2"><FormField id="appointment-notes" label="Notas (opcional)" error={errors.notes} hint={`${values.notes.length}/1000 caracteres`}>
          <textarea rows={3} maxLength={1000} value={values.notes} onChange={(event) => set('notes', event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField></div>
        <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving} disabled={patients.length === 0 || doctors.length === 0}>{appointment ? 'Guardar cambios' : 'Crear cita'}</Button>
        </div>
      </form>
    </Modal>
  );
}
