import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { receiveDeliverySchema, todayForInput, type ReceiveDeliveryValues } from '../schemas';
import type { ReceiveDeliveryPayload, SupplierDelivery } from '../types';

const RECEIVE_FIELDS = ['receivedDate', 'quantityReceived'] as const;
type ReceiveField = (typeof RECEIVE_FIELDS)[number];

export interface ReceiveDeliveryDialogProps {
  delivery: SupplierDelivery;
  onClose: () => void;
  onSubmit: (payload: ReceiveDeliveryPayload) => Promise<void>;
}

export function ReceiveDeliveryDialog({ delivery, onClose, onSubmit }: ReceiveDeliveryDialogProps) {
  const [values, setValues] = useState<ReceiveDeliveryValues>({
    receivedDate: todayForInput(),
    quantityReceived: String(delivery.quantityRequested),
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ReceiveField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(receiveDeliverySchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    const quantityReceived = Number(checked.data.quantityReceived.trim());
    if (delivery.product && delivery.product.quantity + quantityReceived > 999999) {
      setFieldErrors({ quantityReceived: `La existencia resultante no puede superar 999,999. Existencia actual: ${delivery.product.quantity}.` });
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit({ receivedDate: checked.data.receivedDate.trim(), quantityReceived });
    } catch (error) {
      const mapped = mapApiError(error, RECEIVE_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open title={`Recibir entrega #${delivery.id}`} onClose={() => !submitting && onClose()}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <div className="rounded-md bg-active p-3 text-sm">
          <p><strong>Proveedor:</strong> {delivery.supplier?.name ?? `Proveedor ${delivery.supplierId}`}</p>
          <p><strong>Producto:</strong> {delivery.product?.name ?? `Producto ${delivery.productId}`}</p>
          <p><strong>Cantidad solicitada:</strong> {delivery.quantityRequested.toLocaleString('es-MX')}</p>
        </div>
        <p className="text-sm text-muted">Al confirmar, la cantidad recibida se sumará a la existencia del producto y quedará registrada en el historial de movimientos.</p>
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <FormField id="receive-date" label="Fecha de recepción" error={fieldErrors.receivedDate} required>
          <input type="date" max={todayForInput()} value={values.receivedDate} disabled={submitting} onChange={(event) => { setValues((previous) => ({ ...previous, receivedDate: event.target.value })); setFieldErrors((previous) => ({ ...previous, receivedDate: undefined })); }} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="receive-quantity" label="Cantidad recibida" error={fieldErrors.quantityReceived} required>
          <input type="number" min={1} max={999999} step={1} value={values.quantityReceived} disabled={submitting} onChange={(event) => { setValues((previous) => ({ ...previous, quantityReceived: event.target.value })); setFieldErrors((previous) => ({ ...previous, quantityReceived: undefined })); }} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={submitting} onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Confirmar recepción</Button>
        </div>
      </form>
    </Modal>
  );
}
