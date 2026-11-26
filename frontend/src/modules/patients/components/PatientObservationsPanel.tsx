import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Toast } from '../../../shared/components/Toast';
import { useAuth } from '../../../shared/hooks/useAuth';
import { mapApiError } from '../../../shared/lib/validation';
import { formatDateTime } from '../../../shared/lib/formatters';
import { updateMedicalObservation, updateNursingObservation } from '../api';
import type { ObservationAuthor, Patient } from '../types';

interface ObservationEditorProps {
  patientId: number;
  kind: 'medical' | 'nursing';
  title: string;
  text: string;
  at: string | null;
  author: ObservationAuthor | null;
  editable: boolean;
  onChanged: () => void;
}

function ObservationEditor({ patientId, kind, title, text, at, author, editable, onChanged }: ObservationEditorProps) {
  const [value, setValue] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => setValue(text), [text]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editable || saving) return;
    if (value.length > 1000) {
      setFieldError('Debe tener como máximo 1000 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    setFieldError(undefined);
    setSaved(false);
    try {
      if (kind === 'medical') await updateMedicalObservation(patientId, value.trim());
      else await updateNursingObservation(patientId, value.trim());
      setSaved(true);
      onChanged();
    } catch (reason) {
      const mapped = mapApiError(reason, ['text'] as const);
      setFieldError(mapped.fieldErrors.text);
      setError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-page p-4 sm:p-5" aria-labelledby={`${kind}-observation-title`}>
      <div className="mb-4 flex flex-col gap-1">
        <h3 id={`${kind}-observation-title`} className="text-lg font-semibold text-heading">{title}</h3>
        <p className="text-xs text-muted">
          {at ? `Actualizada el ${formatDateTime(at)}${author ? ` por ${author.name}` : ''}` : 'Sin actualizaciones registradas.'}
        </p>
      </div>
      {error && <div className="mb-3"><ErrorBanner message={error} onDismiss={() => setError(null)} /></div>}
      {saved && <Toast message="Observación guardada correctamente." tone="success" onClose={() => setSaved(false)} />}
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <FormField id={`${kind}-observation`} label={editable ? 'Editar observación' : 'Observación'} error={fieldError} hint={`${value.length}/1000 caracteres`}>
          <textarea
            rows={6}
            value={value}
            maxLength={1000}
            readOnly={!editable}
            disabled={saving}
            onChange={(event) => { setValue(event.target.value); setSaved(false); }}
            className={`${INPUT_CLASSES} ${!editable ? 'bg-active text-muted' : ''}`}
          />
        </FormField>
        {editable && <div className="flex justify-end"><Button type="submit" loading={saving}>Guardar observación</Button></div>}
      </form>
    </section>
  );
}

export interface PatientObservationsPanelProps {
  patient: Patient;
  onChanged: () => void;
}

export function PatientObservationsPanel({ patient, onChanged }: PatientObservationsPanelProps) {
  const { user } = useAuth();
  const role = user?.role;
  const active = patient.status === 'activo';
  const canEditMedical = role === 'ADMIN' || (role === 'DOCTOR' && active && patient.doctorId === user?.id);
  const canEditNursing = role === 'ADMIN' || (role === 'NURSE' && active && patient.nurseId === user?.id);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
      <ObservationEditor
        patientId={patient.id}
        kind="medical"
        title="Observación médica"
        text={patient.medicalObservation}
        at={patient.medicalObservationAt}
        author={patient.medicalObservationBy}
        editable={canEditMedical}
        onChanged={onChanged}
      />
      <ObservationEditor
        patientId={patient.id}
        kind="nursing"
        title="Observación de enfermería"
        text={patient.nursingObservation}
        at={patient.nursingObservationAt}
        author={patient.nursingObservationBy}
        editable={canEditNursing}
        onChanged={onChanged}
      />
    </div>
  );
}
