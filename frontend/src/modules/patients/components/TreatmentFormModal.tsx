import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { createTreatment, updateTreatment } from '../api';
import { treatmentFormSchema, TREATMENT_TYPES, type TreatmentFormValues } from '../schemas';
import type { Treatment } from '../types';
import { toDateTimeInput, toIsoDateTime, TREATMENT_TYPE_LABELS } from '../utils';

const TREATMENT_FIELDS = ['type', 'scheduledAt', 'description'] as const;
type TreatmentField = (typeof TREATMENT_FIELDS)[number];

export interface TreatmentFormModalProps {
  patientId: number;
  treatment: Treatment | 'new';
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function TreatmentFormModal({ patientId, treatment, onClose, onSaved }: TreatmentFormModalProps) {
  const editing = treatment === 'new' ? null : treatment;
  const [values, setValues] = useState<TreatmentFormValues>({
    type: editing?.type ?? 'tratamiento',
    scheduledAt: editing ? toDateTimeInput(editing.scheduledAt) : '',
    description: editing?.description ?? '',
  });
  const [errors, setErrors] = useState<FieldErrors<TreatmentField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const checked = validateForm(treatmentFormSchema, values);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const payload = {
        type: checked.data.type,
        scheduledAt: toIsoDateTime(checked.data.scheduledAt),
        description: checked.data.description.trim(),
      };
      if (editing) await updateTreatment(patientId, editing.id, payload);
      else await createTreatment(patientId, payload);
      onSaved(editing ? 'Tratamiento actualizado correctamente.' : 'Tratamiento programado correctamente.');
    } catch (reason) {
      const mapped = mapApiError(reason, TREATMENT_FIELDS);
      setErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={editing ? `Editar ${TREATMENT_TYPE_LABELS[editing.type].toLowerCase()}` : 'Programar tratamiento o cirugía'} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <FormField id="treatment-type" label="Tipo" error={errors.type} required>
          <select value={values.type} onChange={(event) => setValues((current) => ({ ...current, type: event.target.value as TreatmentFormValues['type'] }))} disabled={saving} className={INPUT_CLASSES}>
            {TREATMENT_TYPES.map((type) => <option key={type} value={type}>{TREATMENT_TYPE_LABELS[type]}</option>)}
          </select>
        </FormField>
        <FormField id="treatment-scheduledAt" label="Fecha y hora programada" error={errors.scheduledAt} required>
          <input type="datetime-local" value={values.scheduledAt} onChange={(event) => setValues((current) => ({ ...current, scheduledAt: event.target.value }))} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="treatment-description" label="Descripción" error={errors.description} hint={`${values.description.length}/500 caracteres`} required>
          <textarea rows={5} value={values.description} maxLength={500} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving}>{editing ? 'Guardar cambios' : 'Programar'}</Button>
        </div>
      </form>
    </Modal>
  );
}
