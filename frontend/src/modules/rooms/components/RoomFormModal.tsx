import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { createRoom, updateRoom } from '../api';
import { roomFormSchema, type RoomFormValues } from '../schemas';
import type { Room, RoomDepartment } from '../types';

const ROOM_FIELDS = ['number', 'departmentId', 'capacity'] as const;
type RoomField = (typeof ROOM_FIELDS)[number];

export interface RoomFormModalProps {
  room: Room | null;
  departments: readonly RoomDepartment[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

export function RoomFormModal({ room, departments, onClose, onSaved }: RoomFormModalProps) {
  const [values, setValues] = useState<RoomFormValues>({
    number: room ? String(room.number) : '',
    departmentId: room ? String(room.departmentId) : '',
    capacity: room ? String(room.capacity) : '1',
  });
  const [errors, setErrors] = useState<FieldErrors<RoomField>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const checked = validateForm(roomFormSchema, values);
    if (!checked.ok) {
      setErrors(checked.fieldErrors);
      setError(null);
      return;
    }
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const payload = { number: Number(checked.data.number), departmentId: Number(checked.data.departmentId), capacity: Number(checked.data.capacity) };
      if (room) await updateRoom(room.id, payload);
      else await createRoom(payload);
      onSaved(room ? 'Habitación actualizada correctamente.' : 'Habitación creada correctamente.');
    } catch (reason) {
      const mapped = mapApiError(reason, ROOM_FIELDS, { conflictField: 'number' });
      setErrors(mapped.fieldErrors);
      setError(mapped.formError);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open title={room ? `Editar habitación ${room.number}` : 'Nueva habitación'} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
        <FormField id="room-number" label="Número de habitación" error={errors.number} required>
          <input type="number" min={1} max={9999} step={1} value={values.number} onChange={(event) => setValues((current) => ({ ...current, number: event.target.value }))} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="room-department" label="Departamento" error={errors.departmentId} required>
          <select value={values.departmentId} onChange={(event) => setValues((current) => ({ ...current, departmentId: event.target.value }))} disabled={saving} className={INPUT_CLASSES}>
            <option value="">Selecciona un departamento</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </FormField>
        <FormField id="room-capacity" label="Capacidad de pacientes" error={errors.capacity} hint="Entre 1 y 10 pacientes." required>
          <input type="number" min={1} max={10} step={1} value={values.capacity} onChange={(event) => setValues((current) => ({ ...current, capacity: event.target.value }))} disabled={saving} className={INPUT_CLASSES} />
        </FormField>
        {room && room.activeCount > Number(values.capacity || 0) && <p className="text-sm text-status-danger-fg">La capacidad no puede ser menor que los {room.activeCount} pacientes actualmente asignados.</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" loading={saving} disabled={Boolean(room && room.activeCount > Number(values.capacity || 0))}>{room ? 'Guardar cambios' : 'Crear habitación'}</Button>
        </div>
      </form>
    </Modal>
  );
}
