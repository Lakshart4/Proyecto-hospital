import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { toApiError } from '../../../shared/lib/apiClient';
import { hospitalDateTimeToIso, toDateTimeLocal } from '../dateUtils';
import type { CalendarItem, EventPayload, PersonalEventPayload, StoredEventType } from '../types';

export interface EventFormModalProps {
  open: boolean;
  personal: boolean;
  anchorDate: string;
  defaultType?: StoredEventType;
  initial?: CalendarItem;
  onClose: () => void;
  onSubmit: (payload: EventPayload | PersonalEventPayload) => Promise<void>;
}

type FieldErrors = Partial<Record<'title' | 'description' | 'startAt' | 'endAt', string>>;

export function EventFormModal({ open, personal, anchorDate, defaultType = 'general', initial, onClose, onSubmit }: EventFormModalProps) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<StoredEventType>(defaultType);
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setType(!personal && initial && (initial.type === 'general' || initial.type === 'actividad' || initial.type === 'entrega') ? initial.type : defaultType);
    setStartAt(initial ? toDateTimeLocal(initial.start) : `${anchorDate}T09:00`);
    setEndAt(initial ? toDateTimeLocal(initial.end) : `${anchorDate}T10:00`);
    setErrors({});
    setSubmitError(null);
    setSaving(false);
  }, [open, personal, anchorDate, defaultType, initial]);

  const close = () => {
    if (!saving) onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const nextErrors: FieldErrors = {};
    const cleanTitle = title.trim();
    if (!cleanTitle) nextErrors.title = 'El título es obligatorio.';
    else if (cleanTitle.length > 150) nextErrors.title = 'El título debe tener como máximo 150 caracteres.';
    if (description.length > 500) nextErrors.description = 'La descripción debe tener como máximo 500 caracteres.';

    let startIso = '';
    let endIso = '';
    try {
      startIso = hospitalDateTimeToIso(startAt);
    } catch {
      nextErrors.startAt = 'Indica una fecha y hora de inicio válidas.';
    }
    try {
      endIso = hospitalDateTimeToIso(endAt);
    } catch {
      nextErrors.endAt = 'Indica una fecha y hora de fin válidas.';
    }
    if (startIso && endIso && endIso < startIso) nextErrors.endAt = 'La fecha de fin no puede ser anterior a la fecha de inicio.';
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    const common = {
      title: cleanTitle,
      description: description.trim() === '' ? undefined : description,
      startAt: startIso,
      endAt: endIso,
    };
    try {
      await onSubmit(personal ? common : { ...common, type });
    } catch (reason) {
      const apiError = toApiError(reason);
      setSubmitError(apiError.message);
      if (apiError.errors.length > 0) {
        const serverErrors: FieldErrors = {};
        for (const error of apiError.errors) {
          if (error.field === 'title' || error.field === 'description' || error.field === 'startAt' || error.field === 'endAt') {
            serverErrors[error.field] = error.message;
          }
        }
        setErrors((current) => ({ ...current, ...serverErrors }));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`${initial ? 'Editar' : 'Nuevo'} evento${personal ? ' personal' : ''}`}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancelar</Button>
          <Button type="submit" form={formId} loading={saving}>{initial ? 'Guardar cambios' : 'Crear evento'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4" noValidate>
        {submitError && <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />}
        <FormField id={`${formId}-title`} label="Título" error={errors.title} required>
          <input className={INPUT_CLASSES} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} required autoFocus />
        </FormField>
        {!personal && (
          <FormField id={`${formId}-type`} label="Tipo de evento" required>
            <select className={INPUT_CLASSES} value={type} onChange={(event) => setType(event.target.value as StoredEventType)} required>
              <option value="general">General</option>
              <option value="actividad">Actividad</option>
              <option value="entrega">Entrega</option>
            </select>
          </FormField>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id={`${formId}-start`} label="Inicio" error={errors.startAt} required>
            <input type="datetime-local" step={60} className={INPUT_CLASSES} value={startAt} onChange={(event) => setStartAt(event.target.value)} required />
          </FormField>
          <FormField id={`${formId}-end`} label="Fin" error={errors.endAt} required>
            <input type="datetime-local" step={60} className={INPUT_CLASSES} value={endAt} onChange={(event) => setEndAt(event.target.value)} required />
          </FormField>
        </div>
        <FormField id={`${formId}-description`} label="Descripción" error={errors.description} hint="Máximo 500 caracteres.">
          <textarea className={`${INPUT_CLASSES} min-h-24 resize-y`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} />
        </FormField>
      </form>
    </Modal>
  );
}
