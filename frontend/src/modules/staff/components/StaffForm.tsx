import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { MESSAGES } from '../../../shared/lib/messages';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import type { StaffPayload } from '../api';
import { EMPLOYEE_ROLES, SHIFTS, staffFormSchema, type StaffFormValues } from '../schemas';
import type { Department } from '../types';

const STAFF_FIELDS = [
  'internalId',
  'email',
  'role',
  'name',
  'position',
  'description',
  'specialty',
  'departmentId',
  'yearsExperience',
  'shift',
  'phone',
  'birthDate',
] as const;

type StaffField = (typeof STAFF_FIELDS)[number];

export interface StaffFormProps {
  departments: readonly Department[];
  initial?: Partial<StaffFormValues>;
  submitLabel: string;
  onSubmit: (payload: StaffPayload) => Promise<void>;
  onCancel?: () => void;
}

export function StaffForm({ departments, initial, submitLabel, onSubmit, onCancel }: StaffFormProps) {
  const [values, setValues] = useState<StaffFormValues>({
    internalId: initial?.internalId ?? '',
    email: initial?.email ?? '',
    role: initial?.role ?? 'DOCTOR',
    name: initial?.name ?? '',
    position: initial?.position ?? '',
    description: initial?.description ?? '',
    specialty: initial?.specialty ?? '',
    departmentId: initial?.departmentId ?? (departments[0] ? String(departments[0].id) : ''),
    yearsExperience: initial?.yearsExperience ?? '0',
    shift: initial?.shift ?? 'matutino',
    phone: initial?.phone ?? '',
    birthDate: initial?.birthDate ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<StaffField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: StaffField) => (value: string) => setValues((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(staffFormSchema, values);
    if (!checked.ok) {
      setFieldErrors(checked.fieldErrors);
      setFormError(null);
      return;
    }
    setFieldErrors({});
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: StaffPayload = {
        internalId: checked.data.internalId.trim(),
        email: checked.data.email.trim(),
        role: checked.data.role,
        name: checked.data.name.trim(),
        position: checked.data.position.trim(),
        description: checked.data.description.trim(),
        specialty: checked.data.specialty.trim(),
        departmentId: Number(checked.data.departmentId),
        yearsExperience: Number(checked.data.yearsExperience.trim()),
        shift: checked.data.shift,
        phone: checked.data.phone.trim(),
        birthDate: checked.data.birthDate.trim() === '' ? null : checked.data.birthDate.trim(),
      };
      await onSubmit(payload);
    } catch (error) {
      const mapped = mapApiError(error, STAFF_FIELDS);
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
        <FormField id="staff-internalId" label={MESSAGES.staff.fields.internalId} error={fieldErrors.internalId} required>
          <input value={values.internalId} onChange={(e) => set('internalId')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-name" label={MESSAGES.staff.fields.name} error={fieldErrors.name} required>
          <input value={values.name} onChange={(e) => set('name')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-email" label={MESSAGES.staff.fields.email} error={fieldErrors.email} required>
          <input type="email" value={values.email} onChange={(e) => set('email')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-role" label={MESSAGES.staff.fields.role} error={fieldErrors.role} required>
          <select value={values.role} onChange={(e) => set('role')(e.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            {EMPLOYEE_ROLES.map((role) => (
              <option key={role} value={role}>
                {MESSAGES.roles[role]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="staff-position" label={MESSAGES.staff.fields.position} error={fieldErrors.position} required>
          <input value={values.position} onChange={(e) => set('position')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-specialty" label={MESSAGES.staff.fields.specialty} error={fieldErrors.specialty} required>
          <input value={values.specialty} onChange={(e) => set('specialty')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-departmentId" label={MESSAGES.staff.fields.department} error={fieldErrors.departmentId} required>
          <select value={values.departmentId} onChange={(e) => set('departmentId')(e.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            <option value="">Selecciona un departamento</option>
            {departments.map((dept) => (
              <option key={dept.id} value={String(dept.id)}>
                {dept.name}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="staff-yearsExperience" label={MESSAGES.staff.fields.yearsExperience} error={fieldErrors.yearsExperience} required>
          <input type="number" min={0} max={60} value={values.yearsExperience} onChange={(e) => set('yearsExperience')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-shift" label={MESSAGES.staff.fields.shift} error={fieldErrors.shift} required>
          <select value={values.shift} onChange={(e) => set('shift')(e.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            {SHIFTS.map((shift) => (
              <option key={shift} value={shift}>
                {MESSAGES.staff.shifts[shift]}
              </option>
            ))}
          </select>
        </FormField>
        <FormField id="staff-phone" label={MESSAGES.staff.fields.phone} error={fieldErrors.phone} required>
          <input value={values.phone} onChange={(e) => set('phone')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="staff-birthDate" label={MESSAGES.staff.fields.birthDate} error={fieldErrors.birthDate} hint="Formato AAAA-MM-DD (opcional)">
          <input type="date" value={values.birthDate} onChange={(e) => set('birthDate')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
      </div>
      <FormField id="staff-description" label={MESSAGES.staff.fields.description} error={fieldErrors.description}>
        <textarea rows={3} value={values.description} onChange={(e) => set('description')(e.target.value)} disabled={submitting} className={INPUT_CLASSES} />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>
            {MESSAGES.common.cancel}
          </Button>
        )}
        <Button type="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
