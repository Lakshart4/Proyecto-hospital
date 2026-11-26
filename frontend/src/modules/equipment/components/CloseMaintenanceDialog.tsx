import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { closeMaintenance } from '../api';
import { CLOSE_MAINTENANCE_FIELDS, closeMaintenanceSchema, todayInputValue, type CloseMaintenanceFormValues } from '../schemas';
import { MAINTENANCE_RESULT_STATUSES, type MaintenanceRecord } from '../types';

type CloseMaintenanceField = (typeof CLOSE_MAINTENANCE_FIELDS)[number];

export function CloseMaintenanceDialog({
  record,
  onClose,
  onClosed,
}: {
  record: MaintenanceRecord | null;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [values, setValues] = useState<CloseMaintenanceFormValues>({ endDate: todayInputValue(), resultingStatus: 'disponible' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<CloseMaintenanceField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (record) {
      setValues({ endDate: todayInputValue(), resultingStatus: 'disponible' });
      setFieldErrors({});
      setFormError(null);
    }
  }, [record]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!record || submitting) return;
    const checked = validateForm(closeMaintenanceSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    if (checked.data.endDate < record.startDate.slice(0, 10)) {
      setFieldErrors({ endDate: 'La fecha de fin no puede ser anterior a la fecha de inicio.' });
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await closeMaintenance(record.id, {
        endDate: checked.data.endDate,
        resultingStatus: checked.data.resultingStatus,
      });
      onClosed();
    } catch (reason) {
      const mapped = mapApiError(reason, CLOSE_MAINTENANCE_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={record !== null} title="Cerrar mantenimiento" onClose={() => !submitting && onClose()}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {record && <p className="text-sm text-muted"><strong className="text-ink">{record.equipment.name}</strong> · Inicio: {record.startDate.slice(0, 10)}</p>}
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <FormField id="maintenance-end" label="Fecha de fin" error={fieldErrors.endDate} required>
          <input type="date" min={record?.startDate.slice(0, 10)} value={values.endDate} onChange={(event) => setValues((current) => ({ ...current, endDate: event.target.value }))} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="maintenance-result" label="Estado operativo resultante" error={fieldErrors.resultingStatus} required>
          <select value={values.resultingStatus} onChange={(event) => setValues((current) => ({ ...current, resultingStatus: event.target.value as CloseMaintenanceFormValues['resultingStatus'] }))} disabled={submitting} className={INPUT_CLASSES}>
            {MAINTENANCE_RESULT_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Cerrar mantenimiento</Button>
        </div>
      </form>
    </Modal>
  );
}
