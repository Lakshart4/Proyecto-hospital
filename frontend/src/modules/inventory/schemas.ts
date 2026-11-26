import { z } from 'zod';
import { requiredText } from '../../shared/lib/validation';

export const MEDICAL_CATEGORIES = ['insumo médico', 'medicamento'] as const;
export const PRODUCT_CATEGORIES = [...MEDICAL_CATEGORIES, 'material de limpieza'] as const;
export const SUPPLY_SUBCATEGORIES = ['jeringa', 'sonda', 'catéter', 'suero', 'instrumental', 'material médico'] as const;
export const MEDICATION_TYPES = ['genérico', 'de patente'] as const;
export const CONTROL_CLASSES = ['venta libre', 'receta simple', 'receta retenida', 'controlado', 'uso hospitalario'] as const;
export const MOVEMENT_TYPES = ['entrada', 'salida', 'ajuste'] as const;

const integerString = (minimum: number, maximum: number, label = 'La cantidad') =>
  z.string().refine(
    (value) => {
      const normalized = value.trim();
      return /^\d+$/.test(normalized) && Number(normalized) >= minimum && Number(normalized) <= maximum;
    },
    { error: `${label} debe ser un número entero entre ${minimum} y ${maximum.toLocaleString('es-MX')}.` },
  );

const optionalMedicationText = z.string().max(100, { error: 'Debe tener como máximo 100 caracteres.' });

export const productFormSchema = z
  .object({
    name: requiredText(100),
    category: z.enum(PRODUCT_CATEGORIES, { error: 'Selecciona una categoría válida.' }),
    classification: z.string().max(50, { error: 'Debe tener como máximo 50 caracteres.' }),
    quantity: integerString(0, 999999),
    minStock: integerString(0, 999999, 'El stock mínimo'),
    supplierId: z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, { error: 'Selecciona un proveedor.' }),
    medicationType: z.enum(MEDICATION_TYPES, { error: 'Selecciona un tipo de medicamento válido.' }),
    activeIngredient: optionalMedicationText,
    tradeName: optionalMedicationText,
    controlClass: z.enum(CONTROL_CLASSES, { error: 'Selecciona una clasificación de control válida.' }),
    requiresPrescription: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.category === 'material de limpieza') {
      if (values.classification.trim() === '') {
        context.addIssue({ code: 'custom', path: ['classification'], message: 'La clasificación es obligatoria.' });
      }
      return;
    }
    if (values.category === 'insumo médico') {
      if (!(SUPPLY_SUBCATEGORIES as readonly string[]).includes(values.classification)) {
        context.addIssue({ code: 'custom', path: ['classification'], message: 'Selecciona una subcategoría de insumo válida.' });
      }
      return;
    }
    if (values.activeIngredient.trim() === '') {
      context.addIssue({ code: 'custom', path: ['activeIngredient'], message: 'El principio activo es obligatorio.' });
    }
    if (values.medicationType === 'de patente' && values.tradeName.trim() === '') {
      context.addIssue({ code: 'custom', path: ['tradeName'], message: 'El nombre comercial es obligatorio para medicamentos de patente.' });
    }
    const prescriptionRequired = ['receta simple', 'receta retenida', 'controlado'].includes(values.controlClass);
    if (prescriptionRequired && !values.requiresPrescription) {
      context.addIssue({ code: 'custom', path: ['requiresPrescription'], message: 'Esta clasificación requiere receta.' });
    }
    if (values.controlClass === 'venta libre' && values.requiresPrescription) {
      context.addIssue({ code: 'custom', path: ['requiresPrescription'], message: 'Un medicamento de venta libre no puede requerir receta.' });
    }
  });

export type ProductFormValues = z.input<typeof productFormSchema>;

export const movementFormSchema = z.object({
  type: z.enum(MOVEMENT_TYPES, { error: 'Selecciona un tipo de movimiento válido.' }),
  quantity: integerString(0, 999999),
  reason: requiredText(200),
}).superRefine((values, context) => {
  if (values.type !== 'ajuste' && Number(values.quantity.trim()) < 1) {
    context.addIssue({ code: 'custom', path: ['quantity'], message: 'La cantidad debe ser un número entero entre 1 y 999,999.' });
  }
});

export type MovementFormValues = z.input<typeof movementFormSchema>;
