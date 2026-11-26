import { useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { toApiError } from '../../../shared/lib/apiClient';
import { cancelAppointment } from '../api';
import type { Appointment } from '../types';

export function CancelAppointmentDialog({ appointment, onClose, onSaved }: { appointment: Appointment; onClose: () => void; onSaved: (message: string) => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const confirm = async () => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      await cancelAppointment(appointment.id, reason.trim());
      onSaved('Cita cancelada correctamente.');
    } catch (reason) { setError(toApiError(reason).message); }
    finally { setSaving(false); }
  };
  return (
    <Modal open title="Cancelar cita médica" onClose={() => !saving && onClose()} footer={<><Button variant="secondary" onClick={onClose} disabled={saving}>Volver</Button><Button variant="danger" onClick={() => void confirm()} loading={saving}>Confirmar cancelación</Button></>}>
      <div className="flex flex-col gap-4">
        <p>Se cancelará la cita de <strong>{appointment.patient.firstName} {appointment.patient.lastName}</strong>. El registro se conservará en el historial.</p>
        {error && <ErrorBanner message={error} />}
        <FormField id="cancel-appointment-reason" label="Motivo de cancelación (opcional)" hint={`${reason.length}/500 caracteres`}>
          <textarea rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
      </div>
    </Modal>
  );
}
