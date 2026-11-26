import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { MOVEMENT_TYPES, movementFormSchema, type MovementFormValues } from '../schemas';
import type { MovementPayload, MovementType, Product } from '../types';

const MOVEMENT_FIELDS = ['type', 'quantity', 'reason'] as const;
type MovementField = (typeof MOVEMENT_FIELDS)[number];

export interface MovementDialogProps {
  product: Product;
  onClose: () => void;
  onSubmit: (payload: MovementPayload) => Promise<void>;
  onSaved: () => void;
}

export function MovementDialog({ product, onClose, onSubmit, onSaved }: MovementDialogProps) {
  const [values, setValues] = useState<MovementFormValues>({ type: 'entrada', quantity: '1', reason: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<MovementField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: MovementField, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(movementFormSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    const quantity = Number(checked.data.quantity.trim());
    if (checked.data.type === 'salida' && quantity > product.quantity) {
      setFieldErrors({ quantity: `La salida no puede superar la existencia de ${product.quantity}.` });
      return;
    }
    if (checked.data.type === 'entrada' && product.quantity + quantity > 999999) {
      setFieldErrors({ quantity: 'La cantidad resultante no puede superar 999,999.' });
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit({ type: checked.data.type, quantity, reason: checked.data.reason.trim() });
      onSaved();
    } catch (error) {
      const mapped = mapApiError(error, MOVEMENT_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open title={`Registrar movimiento · ${product.name}`} onClose={() => !submitting && onClose()}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <p className="rounded-md bg-active px-3 py-2 text-sm">Existencia actual: <strong>{product.quantity.toLocaleString('es-MX')}</strong></p>
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <FormField id="movement-type" label="Tipo de movimiento" error={fieldErrors.type} required>
          <select value={values.type} disabled={submitting} onChange={(event) => set('type', event.target.value as MovementType)} className={INPUT_CLASSES}>
            {MOVEMENT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </FormField>
        <FormField
          id="movement-quantity"
          label={values.type === 'ajuste' ? 'Nueva cantidad' : 'Cantidad'}
          error={fieldErrors.quantity}
          hint={values.type === 'ajuste' ? 'En un ajuste, indica la existencia final.' : 'Indica cuántas unidades entran o salen.'}
          required
        >
          <input type="number" min={values.type === 'ajuste' ? 0 : 1} max={999999} step={1} value={values.quantity} disabled={submitting} onChange={(event) => set('quantity', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="movement-reason" label="Motivo" error={fieldErrors.reason} required>
          <textarea rows={3} maxLength={200} value={values.reason} disabled={submitting} onChange={(event) => set('reason', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={submitting} onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Registrar movimiento</Button>
        </div>
      </form>
    </Modal>
  );
}
