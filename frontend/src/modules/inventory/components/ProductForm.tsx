import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import type { ProductPayload } from '../types';
import {
  CONTROL_CLASSES,
  MEDICAL_CATEGORIES,
  MEDICATION_TYPES,
  SUPPLY_SUBCATEGORIES,
  productFormSchema,
  type ProductFormValues,
} from '../schemas';
import type { ControlClass, Product, SupplierReference } from '../types';

const PRODUCT_FIELDS = [
  'name', 'category', 'classification', 'quantity', 'minStock', 'supplierId',
  'medicationType', 'activeIngredient', 'tradeName', 'controlClass', 'requiresPrescription',
] as const;
type ProductField = (typeof PRODUCT_FIELDS)[number];

export interface ProductFormProps {
  mode: 'medical' | 'cleaning';
  suppliers: readonly SupplierReference[];
  product?: Product | null;
  onSubmit: (payload: ProductPayload) => Promise<void>;
  onCancel: () => void;
}

export function ProductForm({ mode, suppliers, product, onSubmit, onCancel }: ProductFormProps) {
  const medication = product?.medicationInfo;
  const [values, setValues] = useState<ProductFormValues>({
    name: product?.name ?? '',
    category: product?.category ?? (mode === 'cleaning' ? 'material de limpieza' : 'insumo médico'),
    classification: product?.classification ?? (mode === 'cleaning' ? '' : 'jeringa'),
    quantity: product ? String(product.quantity) : '0',
    minStock: product ? String(product.minStock) : '0',
    supplierId: product ? String(product.supplierId) : '',
    medicationType: medication?.type ?? 'genérico',
    activeIngredient: medication?.activeIngredient ?? '',
    tradeName: medication?.tradeName ?? '',
    controlClass: medication?.controlClass ?? 'venta libre',
    requiresPrescription: medication?.requiresPrescription ?? false,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ProductField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends ProductField>(field: K, value: ProductFormValues[K]) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => ({ ...previous, [field]: undefined }));
  };

  const changeControlClass = (controlClass: ControlClass) => {
    const forced = ['receta simple', 'receta retenida', 'controlado'].includes(controlClass);
    setValues((previous) => ({
      ...previous,
      controlClass,
      requiresPrescription: controlClass === 'venta libre' ? false : forced ? true : previous.requiresPrescription,
    }));
    setFieldErrors((previous) => ({ ...previous, controlClass: undefined, requiresPrescription: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(productFormSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setSubmitting(true);
    setFieldErrors({});
    setFormError(null);
    const data = checked.data;
    const payload: ProductPayload = {
      name: data.name.trim(),
      category: data.category,
      classification: data.category === 'medicamento' ? data.medicationType : data.classification.trim(),
      quantity: Number(data.quantity.trim()),
      minStock: Number(data.minStock.trim()),
      supplierId: Number(data.supplierId),
    };
    if (data.category === 'medicamento') {
      payload.medicationInfo = {
        type: data.medicationType,
        activeIngredient: data.activeIngredient.trim(),
        controlClass: data.controlClass,
        requiresPrescription: data.requiresPrescription,
      };
      if (data.medicationType === 'de patente') payload.medicationInfo.tradeName = data.tradeName.trim();
    }
    try {
      await onSubmit(payload);
    } catch (error) {
      const mapped = mapApiError(error, PRODUCT_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  const isMedication = values.category === 'medicamento';
  return (
    <form onSubmit={handleSubmit} noValidate className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto pr-1">
      {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="product-name" label="Nombre" error={fieldErrors.name} required>
          <input value={values.name} maxLength={100} disabled={submitting} onChange={(event) => set('name', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        {mode === 'medical' && (
          <FormField id="product-category" label="Categoría" error={fieldErrors.category} required>
            <select
              value={values.category}
              disabled={submitting}
              onChange={(event) => {
                const category = event.target.value as ProductFormValues['category'];
                setValues((previous) => ({
                  ...previous,
                  category,
                  classification: category === 'insumo médico'
                    ? (SUPPLY_SUBCATEGORIES as readonly string[]).includes(previous.classification) ? previous.classification : 'jeringa'
                    : previous.medicationType,
                }));
                setFieldErrors((previous) => ({ ...previous, category: undefined, classification: undefined }));
              }}
              className={INPUT_CLASSES}
            >
              {MEDICAL_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </FormField>
        )}
        {!isMedication && (
          <FormField
            id="product-classification"
            label={mode === 'cleaning' ? 'Clasificación' : 'Subcategoría de insumo'}
            error={fieldErrors.classification}
            required
          >
            {values.category === 'insumo médico' ? (
              <select value={values.classification} disabled={submitting} onChange={(event) => set('classification', event.target.value)} className={INPUT_CLASSES}>
                {SUPPLY_SUBCATEGORIES.map((subcategory) => <option key={subcategory} value={subcategory}>{subcategory}</option>)}
              </select>
            ) : (
              <input value={values.classification} maxLength={50} disabled={submitting} onChange={(event) => set('classification', event.target.value)} className={INPUT_CLASSES} />
            )}
          </FormField>
        )}
        <FormField id="product-quantity" label="Cantidad" error={fieldErrors.quantity} required>
          <input type="number" min={0} max={999999} step={1} value={values.quantity} disabled={submitting} onChange={(event) => set('quantity', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="product-minStock" label="Stock mínimo" error={fieldErrors.minStock} required>
          <input type="number" min={0} max={999999} step={1} value={values.minStock} disabled={submitting} onChange={(event) => set('minStock', event.target.value)} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="product-supplier" label="Proveedor" error={fieldErrors.supplierId} required>
          <select value={values.supplierId} disabled={submitting} onChange={(event) => set('supplierId', event.target.value)} className={INPUT_CLASSES}>
            <option value="">Selecciona un proveedor</option>
            {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
          </select>
        </FormField>
        {isMedication && (
          <>
            <FormField id="product-medicationType" label="Tipo de medicamento" error={fieldErrors.medicationType} required>
              <select
                value={values.medicationType}
                disabled={submitting}
                onChange={(event) => {
                  const medicationType = event.target.value as ProductFormValues['medicationType'];
                  setValues((previous) => ({ ...previous, medicationType, classification: medicationType }));
                  setFieldErrors((previous) => ({ ...previous, medicationType: undefined, tradeName: undefined }));
                }}
                className={INPUT_CLASSES}
              >
                {MEDICATION_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </FormField>
            <FormField id="product-activeIngredient" label="Principio activo" error={fieldErrors.activeIngredient} required>
              <input value={values.activeIngredient} maxLength={100} disabled={submitting} onChange={(event) => set('activeIngredient', event.target.value)} className={INPUT_CLASSES} />
            </FormField>
            {values.medicationType === 'de patente' && (
              <FormField id="product-tradeName" label="Nombre comercial" error={fieldErrors.tradeName} required>
                <input value={values.tradeName} maxLength={100} disabled={submitting} onChange={(event) => set('tradeName', event.target.value)} className={INPUT_CLASSES} />
              </FormField>
            )}
            <FormField id="product-controlClass" label="Clasificación de control" error={fieldErrors.controlClass} required>
              <select value={values.controlClass} disabled={submitting} onChange={(event) => changeControlClass(event.target.value as ControlClass)} className={INPUT_CLASSES}>
                {CONTROL_CLASSES.map((controlClass) => <option key={controlClass} value={controlClass}>{controlClass}</option>)}
              </select>
            </FormField>
            <FormField id="product-requiresPrescription" label="¿Requiere receta?" error={fieldErrors.requiresPrescription} required>
              <select value={values.requiresPrescription ? 'true' : 'false'} disabled={submitting} onChange={(event) => set('requiresPrescription', event.target.value === 'true')} className={INPUT_CLASSES}>
                <option value="false">No</option>
                <option value="true">Sí</option>
              </select>
            </FormField>
          </>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="submit" loading={submitting}>{product ? 'Guardar cambios' : 'Crear producto'}</Button>
      </div>
    </form>
  );
}
