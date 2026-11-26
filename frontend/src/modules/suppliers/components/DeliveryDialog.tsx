import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { Modal } from '../../../shared/components/Modal';
import { Spinner } from '../../../shared/components/Spinner';
import { useApi } from '../../../shared/hooks/useApi';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { getSupplier } from '../api';
import { deliveryFormSchema, type DeliveryFormValues } from '../schemas';
import type { DeliveryPayload, Supplier, SupplierDelivery } from '../types';

const DELIVERY_FIELDS = ['supplierId', 'productId', 'quantityRequested', 'scheduledDate'] as const;
type DeliveryField = (typeof DELIVERY_FIELDS)[number];

export interface DeliveryDialogProps {
  suppliers: readonly Supplier[];
  delivery?: SupplierDelivery | null;
  onClose: () => void;
  onSubmit: (payload: DeliveryPayload) => Promise<void>;
}

export function DeliveryDialog({ suppliers, delivery, onClose, onSubmit }: DeliveryDialogProps) {
  const [values, setValues] = useState<DeliveryFormValues>({
    supplierId: delivery ? String(delivery.supplierId) : '',
    productId: delivery ? String(delivery.productId) : '',
    quantityRequested: delivery ? String(delivery.quantityRequested) : '1',
    scheduledDate: delivery?.scheduledDate.slice(0, 10) ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<DeliveryField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const validSupplier = /^\d+$/.test(values.supplierId) && Number(values.supplierId) > 0;
  const supplierQuery = useApi(
    (signal) => getSupplier(Number(values.supplierId), signal),
    [values.supplierId],
    { enabled: validSupplier },
  );
  const products = supplierQuery.data?.products ?? [];

  const set = (field: DeliveryField, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(deliveryFormSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit({
        supplierId: Number(checked.data.supplierId),
        productId: Number(checked.data.productId),
        quantityRequested: Number(checked.data.quantityRequested.trim()),
        scheduledDate: checked.data.scheduledDate.trim(),
      });
    } catch (error) {
      const mapped = mapApiError(error, DELIVERY_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open title={delivery ? `Editar entrega #${delivery.id}` : 'Programar entrega'} onClose={() => !submitting && onClose()}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
        <FormField id="delivery-supplier" label="Proveedor" error={fieldErrors.supplierId} required>
          <select
            value={values.supplierId}
            disabled={submitting}
            onChange={(event) => {
              setValues((previous) => ({ ...previous, supplierId: event.target.value, productId: '' }));
              setFieldErrors((previous) => ({ ...previous, supplierId: undefined, productId: undefined }));
            }}
            className={INPUT_CLASSES}
          >
            <option value="">Selecciona un proveedor</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </FormField>
        {validSupplier && supplierQuery.loading && <div className="flex items-center gap-2 text-sm text-muted"><Spinner size="sm" />Cargando productos del proveedor…</div>}
        {supplierQuery.error && <ErrorBanner message={supplierQuery.error.message} />}
        <FormField
          id="delivery-product"
          label="Producto"
          error={fieldErrors.productId}
          hint={validSupplier && !supplierQuery.loading && products.length === 0 ? 'Este proveedor no tiene productos asignados.' : 'Solo se muestran productos asignados al proveedor seleccionado.'}
          required
        >
          <select value={values.productId} disabled={submitting || !validSupplier || supplierQuery.loading} onChange={(event) => set('productId', event.target.value)} className={INPUT_CLASSES}>
            <option value="">Selecciona un producto</option>
            {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.category}</option>)}
          </select>
        </FormField>
        <FormField id="delivery-quantity" label="Cantidad solicitada" error={fieldErrors.quantityRequested} required>
          <input type="number" min={1} max={999999} step={1} value={values.quantityRequested} disabled={submitting} onChange={(event) => set('quantityRequested', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="delivery-date" label="Fecha programada" error={fieldErrors.scheduledDate} required>
          <input type="date" value={values.scheduledDate} disabled={submitting} onChange={(event) => set('scheduledDate', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={submitting} onClick={onClose}>Cancelar</Button>
          <Button type="submit" loading={submitting}>{delivery ? 'Guardar cambios' : 'Programar entrega'}</Button>
        </div>
      </form>
    </Modal>
  );
}
