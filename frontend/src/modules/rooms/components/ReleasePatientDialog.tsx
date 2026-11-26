import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError } from '../../../shared/lib/validation';
import { releasePatientFromRoom } from '../api';
import { RELEASE_REASONS } from '../schemas';
import type { ReleaseReason, Room, RoomPatient } from '../types';

export interface ReleasePatientDialogProps {
  room: Room;
  patient: RoomPatient;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function ReleasePatientDialog({ room, patient, onClose, onSaved }: ReleasePatientDialogProps) {
  const [reason, setReason] = useState<ReleaseReason>('alta');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [noteError, setNoteError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (note.length > 500) {
      setNoteError('Debe tener como máximo 500 caracteres.');
      return;
    }
    setSaving(true);
    setError(null);
    setNoteError(undefined);
    try {
      await releasePatientFromRoom(room.id, { patientId: patient.patientId, reason, note: note.trim() });
      onSaved(reason === 'alta' ? 'Habitación liberada y paciente dado de alta.' : 'Habitación liberada y fallecimiento registrado.');
    } catch (reason) {
      // En especial, un 409 conserva abierto el diálogo y muestra el mensaje real de la API.
      const mapped = mapApiError(reason, ['patientId', 'reason', 'note'] as const);
      setNoteError(mapped.fieldErrors.note);
      setError(mapped.formError ?? mapped.fieldErrors.reason ?? mapped.fieldErrors.patientId ?? null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`Liberar cama · Habitación ${room.number}`} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-ink"><strong>Paciente:</strong> {patient.firstName} {patient.lastName} ({patient.internalId})</p>
        <p className="rounded-md bg-active p-3 text-sm text-muted">La liberación cambia el estado del paciente y agrega un movimiento a su historial.</p>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <FormField id="release-reason" label="Motivo de liberación" required>
          <select value={reason} onChange={(event) => setReason(event.target.value as ReleaseReason)} disabled={saving} className={INPUT_CLASSES}>
            {RELEASE_REASONS.map((value) => <option key={value} value={value}>{value === 'alta' ? 'Alta' : 'Fallecimiento'}</option>)}
          </select>
        </FormField>
        {reason === 'fallecimiento' && <p className="text-sm font-medium text-status-danger-fg">Confirma que deseas registrar el fallecimiento del paciente.</p>}
        <FormField id="release-note" label="Nota del movimiento (opcional)" error={noteError} hint={`${note.length}/500 caracteres`}>
          <textarea rows={4} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" variant={reason === 'fallecimiento' ? 'danger' : 'primary'} loading={saving}>Confirmar liberación</Button>
        </div>
      </form>
    </Modal>
  );
}
