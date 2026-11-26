import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import type { EquipmentPayload } from '../types';
import { EQUIPMENT_FIELDS, equipmentFormSchema, type EquipmentFormValues } from '../schemas';
import { OPERATIONAL_STATUSES, type Department, type Equipment } from '../types';

type EquipmentField = (typeof EQUIPMENT_FIELDS)[number];

export function equipmentToFormValues(equipment: Equipment): EquipmentFormValues {
  return {
    name: equipment.name,
    category: equipment.category,
    departmentId: String(equipment.departmentId),
    quantity: String(equipment.quantity),
    location: equipment.location,
    operationalStatus: equipment.operationalStatus,
    maintenanceRequired: equipment.maintenanceRequired,
  };
}

export function EquipmentForm({
  departments,
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  departments: readonly Department[];
  initial?: Partial<EquipmentFormValues>;
  submitLabel: string;
  onSubmit: (payload: EquipmentPayload) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<EquipmentFormValues>({
    name: initial?.name ?? '',
    category: initial?.category ?? '',
    departmentId: initial?.departmentId ?? '',
    quantity: initial?.quantity ?? '1',
    location: initial?.location ?? '',
    operationalStatus: initial?.operationalStatus ?? 'disponible',
    maintenanceRequired: initial?.maintenanceRequired ?? false,
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<EquipmentField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: EquipmentField, value: string | boolean) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(equipmentFormSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        name: checked.data.name.trim(),
        category: checked.data.category.trim(),
        departmentId: Number(checked.data.departmentId),
        quantity: Number(checked.data.quantity.trim()),
        location: checked.data.location.trim(),
        operationalStatus: checked.data.operationalStatus,
        maintenanceRequired: checked.data.maintenanceRequired,
      });
    } catch (reason) {
      const mapped = mapApiError(reason, EQUIPMENT_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="equipment-name" label="Nombre" error={fieldErrors.name} required>
          <input value={values.name} onChange={(event) => set('name', event.target.value)} disabled={submitting} maxLength={100} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="equipment-category" label="Categoría" error={fieldErrors.category} required>
          <input value={values.category} onChange={(event) => set('category', event.target.value)} disabled={submitting} maxLength={50} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="equipment-department" label="Departamento" error={fieldErrors.departmentId} required>
          <select value={values.departmentId} onChange={(event) => set('departmentId', event.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            <option value="">Selecciona un departamento</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </FormField>
        <FormField id="equipment-quantity" label="Cantidad" error={fieldErrors.quantity} required>
          <input type="number" min={1} max={9999} step={1} value={values.quantity} onChange={(event) => set('quantity', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="equipment-location" label="Ubicación" error={fieldErrors.location} required>
          <input value={values.location} onChange={(event) => set('location', event.target.value)} disabled={submitting} maxLength={100} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="equipment-status" label="Estado operativo" error={fieldErrors.operationalStatus} required>
          <select value={values.operationalStatus} onChange={(event) => set('operationalStatus', event.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            {OPERATIONAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}
          </select>
        </FormField>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-border p-3 text-sm text-ink">
        <input type="checkbox" checked={values.maintenanceRequired} onChange={(event) => set('maintenanceRequired', event.target.checked)} disabled={submitting} className="mt-1 h-4 w-4" />
        <span>
          <span className="block font-medium">Mantenimiento requerido</span>
          <span className="text-muted">Marca esta opción si el equipo necesita revisión.</span>
        </span>
      </label>
      {fieldErrors.maintenanceRequired && <p className="text-sm text-status-danger-fg">{fieldErrors.maintenanceRequired}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancelar</Button>
        <Button type="submit" loading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
