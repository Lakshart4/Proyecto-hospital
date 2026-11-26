import { useCallback, useRef, useState } from 'react';
import type { z } from 'zod';
import { mapApiError, validateForm, type FieldErrors } from '../lib/validation';

export interface UseFormSubmitResult<K extends string> {
  fieldErrors: FieldErrors<K>;
  formError: string | null;
  submitting: boolean;
  /**
   * Valida `values` con `schema` y, si no hay errores, llama a `send` con los datos validados (sin
   * transformar). Ignora envíos mientras otro está en curso. Devuelve `true` si `send` terminó bien.
   * Si la validación o la API fallan, muestra los errores y los valores del formulario no cambian.
   */
  submit: <S extends z.ZodType>(schema: S, values: z.input<S>, send: (data: z.output<S>) => Promise<void>) => Promise<boolean>;
  setFormError: (message: string | null) => void;
}

/** Estado común de envío de formularios (Req. 3.1, 3.2, 3.5, 15.11, 15.12). */
export function useFormSubmit<K extends string>(fields: readonly K[]): UseFormSubmitResult<K> {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<K>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const fieldsRef = useRef(fields);

  const submit = useCallback<UseFormSubmitResult<K>['submit']>(async (schema, values, send) => {
    if (busy.current) return false;
    const result = validateForm(schema, values);
    if (!result.ok) {
      // Solo los errores de los campos que muestra el formulario.
      const found: Partial<Record<string, string>> = result.fieldErrors;
      const errors: FieldErrors<K> = {};
      for (const field of fieldsRef.current) {
        const message = found[field];
        if (message !== undefined) errors[field] = message;
      }
      setFieldErrors(errors);
      setFormError(null);
      return false;
    }
    setFieldErrors({});
    setFormError(null);
    busy.current = true;
    setSubmitting(true);
    try {
      await send(result.data);
      return true;
    } catch (error) {
      const mapped = mapApiError(error, fieldsRef.current);
      setFieldErrors(mapped.fieldErrors);
      setFormError(mapped.formError);
      return false;
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }, []);

  return { fieldErrors, formError, submitting, submit, setFormError };
}
