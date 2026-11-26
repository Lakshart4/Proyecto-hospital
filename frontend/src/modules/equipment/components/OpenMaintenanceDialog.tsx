import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { openMaintenance } from '../api';
import { OPEN_MAINTENANCE_FIELDS, openMaintenanceSchema, todayInputValue, type OpenMaintenanceFormValues } from '../schemas';
import { MAINTENANCE_TYPES, type Equipment } from '../types';

type OpenMaintenanceField = (typeof OPEN_MAINTENANCE_FIELDS)[number];

export function OpenMaintenanceDialog({
  open,
  equipment,
  onClose,
  onOpened,
}: {
  open: boolean;
  equipment: readonly Equipment[];
  onClose: () => void;
  onOpened: () => void;
}) {
  const [values, setValues] = useState<OpenMaintenanceFormValues>({
    equipmentId: equipment[0] ? String(equipment[0].id) : '',
    type: 'preventivo',
    startDate: todayInputValue(),
    description: '',
    technician: '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<OpenMaintenanceField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(openMaintenanceSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await openMaintenance({
        equipmentId: Number(checked.data.equipmentId),
        type: checked.data.type,
        startDate: checked.data.startDate,
        description: checked.data.description.trim(),
        technician: checked.data.technician.trim(),
      });
      onOpened();
    } catch (reason) {
      const mapped = mapApiError(reason, OPEN_MAINTENANCE_FIELDS, { conflictField: 'equipmentId' });
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} title="Registrar mantenimiento" onClose={() => !submitting && onClose()}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <FormField id="maintenance-equipment" label="Equipo" error={fieldErrors.equipmentId} required>
          <select value={values.equipmentId} onChange={(event) => setValues((current) => ({ ...current, equipmentId: event.target.value }))} disabled={submitting} className={INPUT_CLASSES}>
            <option value="">Selecciona un equipo</option>
            {equipment.map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {item.department.name}</option>
            ))}
          </select>
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="maintenance-type" label="Tipo" error={fieldErrors.type} required>
            <select value={values.type} onChange={(event) => setValues((current) => ({ ...current, type: event.target.value as OpenMaintenanceFormValues['type'] }))} disabled={submitting} className={INPUT_CLASSES}>
              {MAINTENANCE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </FormField>
          <FormField id="maintenance-start" label="Fecha de inicio" error={fieldErrors.startDate} required>
            <input type="date" max={todayInputValue()} value={values.startDate} onChange={(event) => setValues((current) => ({ ...current, startDate: event.target.value }))} disabled={submitting} className={INPUT_CLASSES} />
          </FormField>
        </div>
        <FormField id="maintenance-technician" label="Técnico" error={fieldErrors.technician} required>
          <input value={values.technician} onChange={(event) => setValues((current) => ({ ...current, technician: event.target.value }))} disabled={submitting} maxLength={100} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="maintenance-description" label="Descripción" error={fieldErrors.description} required>
          <textarea rows={4} value={values.description} onChange={(event) => setValues((current) => ({ ...current, description: event.target.value }))} disabled={submitting} maxLength={500} className={INPUT_CLASSES} />
        </FormField>
        <p className="text-xs text-muted">Al registrarlo, el equipo cambiará a “en mantenimiento”.</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Registrar mantenimiento</Button>
        </div>
      </form>
    </Modal>
  );
}
