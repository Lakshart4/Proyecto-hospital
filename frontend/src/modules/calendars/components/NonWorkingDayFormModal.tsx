import { useEffect, useId, useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { toApiError } from '../../../shared/lib/apiClient';
import { naturalDateToIso } from '../dateUtils';
import type { NonWorkingDay, NonWorkingDayPayload } from '../types';

export interface NonWorkingDayFormModalProps {
  open: boolean;
  anchorDate: string;
  initial?: NonWorkingDay;
  onClose: () => void;
  onSubmit: (payload: NonWorkingDayPayload) => Promise<void>;
}

type FieldErrors = Partial<Record<'title' | 'description' | 'date', string>>;

export function NonWorkingDayFormModal({ open, anchorDate, initial, onClose, onSubmit }: NonWorkingDayFormModalProps) {
  const formId = useId();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(anchorDate);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    setDescription(initial?.description ?? '');
    setDate(initial ? initial.date.slice(0, 10) : anchorDate);
    setErrors({});
    setSubmitError(null);
    setSaving(false);
  }, [open, anchorDate, initial]);

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
    let isoDate = '';
    try {
      isoDate = naturalDateToIso(date);
    } catch {
      nextErrors.date = 'Indica una fecha válida.';
    }
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      await onSubmit({ title: cleanTitle, description: description.trim(), date: isoDate });
    } catch (reason) {
      const apiError = toApiError(reason);
      setSubmitError(apiError.message);
      if (apiError.errors.length > 0) {
        const serverErrors: FieldErrors = {};
        for (const error of apiError.errors) {
          if (error.field === 'title' || error.field === 'description' || error.field === 'date') serverErrors[error.field] = error.message;
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
      title={initial ? 'Editar día inhábil' : 'Nuevo día inhábil'}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancelar</Button>
          <Button type="submit" form={formId} loading={saving}>{initial ? 'Guardar cambios' : 'Crear día inhábil'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-4" noValidate>
        {submitError && <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />}
        <FormField id={`${formId}-date`} label="Fecha" error={errors.date} required>
          <input type="date" className={INPUT_CLASSES} value={date} onChange={(event) => setDate(event.target.value)} required autoFocus />
        </FormField>
        <FormField id={`${formId}-title`} label="Título" error={errors.title} required>
          <input className={INPUT_CLASSES} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={150} required />
        </FormField>
        <FormField id={`${formId}-description`} label="Descripción" error={errors.description} hint="Máximo 500 caracteres.">
          <textarea className={`${INPUT_CLASSES} min-h-24 resize-y`} value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={4} />
        </FormField>
      </form>
    </Modal>
  );
}
