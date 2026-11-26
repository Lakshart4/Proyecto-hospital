import { useState, type FormEvent } from 'react';
import { Button } from '../../../shared/components/Button';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { FormField, INPUT_CLASSES } from '../../../shared/components/FormField';
import { mapApiError, validateForm, type FieldErrors } from '../../../shared/lib/validation';
import type { PatientPayload } from '../api';
import { localToday, patientFormSchema, PATIENT_SEXES, type PatientFormValues } from '../schemas';
import type { Department, StaffOption } from '../types';

const PATIENT_FIELDS = [
  'internalId',
  'firstName',
  'lastName',
  'birthDate',
  'sex',
  'phone',
  'admissionDate',
  'reason',
  'departmentId',
  'doctorId',
  'nurseId',
] as const;

type PatientField = (typeof PATIENT_FIELDS)[number];

export interface PatientFormProps {
  departments: readonly Department[];
  doctors: readonly StaffOption[];
  nurses: readonly StaffOption[];
  initial?: Partial<PatientFormValues>;
  submitLabel: string;
  onSubmit: (payload: PatientPayload) => Promise<void>;
  onCancel?: () => void;
}

export function PatientForm({ departments, doctors, nurses, initial, submitLabel, onSubmit, onCancel }: PatientFormProps) {
  const [values, setValues] = useState<PatientFormValues>({
    internalId: initial?.internalId ?? '',
    firstName: initial?.firstName ?? '',
    lastName: initial?.lastName ?? '',
    birthDate: initial?.birthDate ?? '',
    sex: initial?.sex ?? 'X',
    phone: initial?.phone ?? '',
    admissionDate: initial?.admissionDate ?? localToday(),
    reason: initial?.reason ?? '',
    departmentId: initial?.departmentId ?? '',
    doctorId: initial?.doctorId ?? '',
    nurseId: initial?.nurseId ?? '',
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<PatientField>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (field: PatientField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    const checked = validateForm(patientFormSchema, values);
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
        internalId: checked.data.internalId.trim(),
        firstName: checked.data.firstName.trim(),
        lastName: checked.data.lastName.trim(),
        birthDate: checked.data.birthDate,
        sex: checked.data.sex,
        phone: checked.data.phone.trim() === '' ? null : checked.data.phone.trim(),
        admissionDate: checked.data.admissionDate,
        reason: checked.data.reason.trim(),
        departmentId: Number(checked.data.departmentId),
        doctorId: Number(checked.data.doctorId),
        nurseId: Number(checked.data.nurseId),
      });
    } catch (reason) {
      const mapped = mapApiError(reason, PATIENT_FIELDS);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError && <ErrorBanner message={formError} onDismiss={() => setFormError(null)} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField id="patient-internalId" label="ID interno" error={fieldErrors.internalId} required>
          <input value={values.internalId} maxLength={30} onChange={(event) => set('internalId', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="patient-sex" label="Sexo" error={fieldErrors.sex} required>
          <select value={values.sex} onChange={(event) => set('sex', event.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            {PATIENT_SEXES.map((sex) => (
              <option key={sex} value={sex}>{sex === 'F' ? 'Femenino' : sex === 'M' ? 'Masculino' : 'Otro / no especificado'}</option>
            ))}
          </select>
        </FormField>
        <FormField id="patient-firstName" label="Nombre(s)" error={fieldErrors.firstName} required>
          <input value={values.firstName} maxLength={100} onChange={(event) => set('firstName', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="patient-lastName" label="Apellidos" error={fieldErrors.lastName} required>
          <input value={values.lastName} maxLength={100} onChange={(event) => set('lastName', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="patient-birthDate" label="Fecha de nacimiento" error={fieldErrors.birthDate} required>
          <input type="date" value={values.birthDate} max={localToday()} onChange={(event) => set('birthDate', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="patient-phone" label="Teléfono (opcional)" error={fieldErrors.phone}>
          <input type="tel" value={values.phone} maxLength={30} onChange={(event) => set('phone', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="patient-admissionDate" label="Fecha de ingreso" error={fieldErrors.admissionDate} required>
          <input type="date" value={values.admissionDate} max={localToday()} onChange={(event) => set('admissionDate', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
        </FormField>
        <FormField id="patient-departmentId" label="Departamento" error={fieldErrors.departmentId} required>
          <select value={values.departmentId} onChange={(event) => set('departmentId', event.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            <option value="">Selecciona un departamento</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </select>
        </FormField>
        <FormField id="patient-doctorId" label="Médico responsable" error={fieldErrors.doctorId} required>
          <select value={values.doctorId} onChange={(event) => set('doctorId', event.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            <option value="">Selecciona un médico</option>
            {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name} · {doctor.internalId}</option>)}
          </select>
        </FormField>
        <FormField id="patient-nurseId" label="Enfermero responsable" error={fieldErrors.nurseId} required>
          <select value={values.nurseId} onChange={(event) => set('nurseId', event.target.value)} disabled={submitting} className={INPUT_CLASSES}>
            <option value="">Selecciona un enfermero</option>
            {nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.name} · {nurse.internalId}</option>)}
          </select>
        </FormField>
      </div>
      <FormField id="patient-reason" label="Motivo general de hospitalización" error={fieldErrors.reason} hint={`${values.reason.length}/500 caracteres`} required>
        <textarea rows={4} value={values.reason} maxLength={500} onChange={(event) => set('reason', event.target.value)} disabled={submitting} className={INPUT_CLASSES} />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancelar</Button>}
        <Button type="submit" loading={submitting}>{submitLabel}</Button>
      </div>
    </form>
  );
}
