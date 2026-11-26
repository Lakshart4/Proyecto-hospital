import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import { supplierFormSchema, type SupplierFormValues } from '../schemas';
import type { Supplier, SupplierPayload } from '../types';

const SUPPLIER_FIELDS = ['name', 'contact'] as const;
type SupplierField = (typeof SUPPLIER_FIELDS)[number];

export interface SupplierFormProps {
  supplier?: Supplier | null;
  onSubmit: (payload: SupplierPayload) => Promise<void>;
  onCancel: () => void;
}

export function SupplierForm({ supplier, onSubmit, onCancel }: SupplierFormProps) {
  const [values, setValues] = useState<SupplierFormValues>({ name: supplier?.name ?? '', contact: supplier?.contact ?? '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SupplierField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(supplierFormSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    try {
      await onSubmit({ name: checked.data.name.trim(), contact: checked.data.contact.trim() });
    } catch (error) {
      const mapped = mapApiError(error, SUPPLIER_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
      <FormField id="supplier-name" label="Nombre del proveedor" error={fieldErrors.name} required>
        <input value={values.name} maxLength={100} disabled={submitting} onChange={(event) => { setValues((previous) => ({ ...previous, name: event.target.value })); setFieldErrors((previous) => ({ ...previous, name: undefined })); }} className={INPUT_CLASSES} />
      </FormField>
      <FormField id="supplier-contact" label="Contacto ficticio" error={fieldErrors.contact} hint="Teléfono, correo u otro dato de contacto de demostración." required>
        <textarea rows={3} value={values.contact} maxLength={200} disabled={submitting} onChange={(event) => { setValues((previous) => ({ ...previous, contact: event.target.value })); setFieldErrors((previous) => ({ ...previous, contact: undefined })); }} className={INPUT_CLASSES} />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={submitting} onClick={onCancel}>Cancelar</Button>
        <Button type="submit" loading={submitting}>{supplier ? 'Guardar cambios' : 'Crear proveedor'}</Button>
      </div>
    </form>
  );
}
