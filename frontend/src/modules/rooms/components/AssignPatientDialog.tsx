import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { SearchBox } from '../../../shared/components/SearchBox';
import { Spinner } from '../../../shared/components/Spinner';
import { useApi } from '../../../shared/hooks/useApi';
import { mapApiError } from '../../../shared/lib/validation';
import { assignPatientToRoom, listAssignablePatients } from '../api';
import type { Room } from '../types';

export interface AssignPatientDialogProps {
  room: Room;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function AssignPatientDialog({ room, onClose, onSaved }: AssignPatientDialogProps) {
  const patientsQuery = useApi((signal) => listAssignablePatients(signal), []);
  const [search, setSearch] = useState('');
  const [patientId, setPatientId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  const normalized = search.trim().toLocaleLowerCase('es');
  const patients = (patientsQuery.data ?? []).filter((patient) => {
    const text = `${patient.firstName} ${patient.lastName} ${patient.internalId}`.toLocaleLowerCase('es');
    return normalized === '' || text.includes(normalized);
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    if (!/^\d+$/.test(patientId)) {
      setFieldError('Selecciona un paciente.');
      return;
    }
    setSaving(true);
    setError(null);
    setFieldError(undefined);
    try {
      await assignPatientToRoom(room.id, Number(patientId));
      onSaved('Paciente asignado a la habitación correctamente.');
    } catch (reason) {
      // El diálogo permanece abierto para que el usuario pueda elegir otro Paciente sin perder el contexto.
      const mapped = mapApiError(reason, ['patientId'] as const);
      setFieldError(mapped.fieldErrors.patientId);
      setError(mapped.formError ?? (mapped.fieldErrors.patientId ? null : 'No se pudo asignar el paciente.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={`Asignar paciente · Habitación ${room.number}`} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <p className="text-sm text-muted">Quedan {room.capacity - room.activeCount} lugares disponibles. Solo se pueden asignar pacientes activos sin otra habitación.</p>
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        {patientsQuery.error && <ErrorBanner message={patientsQuery.error.message} />}
        <SearchBox value={search} onChange={setSearch} label="Buscar paciente para asignar" placeholder="Filtrar por nombre o ID…" />
        {patientsQuery.loading ? (
          <div className="flex items-center gap-2 py-3"><Spinner /><span className="text-sm text-muted">Cargando pacientes activos…</span></div>
        ) : (
          <FormField id="assignment-patient" label="Paciente activo" error={fieldError} hint={`${patients.length} pacientes visibles`} required>
            <select value={patientId} onChange={(event) => { setPatientId(event.target.value); setFieldError(undefined); }} disabled={saving || patients.length === 0} className={INPUT_CLASSES}>
              <option value="">{patients.length === 0 ? 'No hay pacientes disponibles' : 'Selecciona un paciente'}</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>{patient.firstName} {patient.lastName} · {patient.internalId} · {patient.department.name}</option>
              ))}
            </select>
          </FormField>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving} disabled={patientsQuery.loading || patients.length === 0}>Asignar paciente</Button>
        </div>
      </form>
    </Modal>
  );
}
