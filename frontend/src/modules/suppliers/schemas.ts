import { z } from 'zod';
import { requiredText } from '../../shared/lib/validation';

export const DELIVERY_STATUSES = ['programada', 'recibida', 'cancelada'] as const;

export function isRealDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function todayForInput(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const idField = (label: string) => z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, { error: `Selecciona ${label}.` });
const quantityField = z.string().refine(
  (value) => /^\d+$/.test(value.trim()) && Number(value.trim()) >= 1 && Number(value.trim()) <= 999999,
  { error: 'La cantidad debe ser un número entero entre 1 y 999,999.' },
);

export const supplierFormSchema = z.object({
  name: requiredText(100),
  contact: requiredText(200),
});
export type SupplierFormValues = z.input<typeof supplierFormSchema>;

export const deliveryFormSchema = z.object({
  supplierId: idField('un proveedor'),
  productId: idField('un producto'),
  quantityRequested: quantityField,
  scheduledDate: z.string()
    .refine((value) => value.trim() !== '', { error: 'La fecha programada es obligatoria.', abort: true })
    .refine((value) => isRealDate(value.trim()), { error: 'Ingresa una fecha programada válida.' }),
});
export type DeliveryFormValues = z.input<typeof deliveryFormSchema>;

export const receiveDeliverySchema = z.object({
  receivedDate: z.string()
    .refine((value) => value.trim() !== '', { error: 'La fecha de recepción es obligatoria.', abort: true })
    .refine((value) => isRealDate(value.trim()), { error: 'Ingresa una fecha de recepción válida.', abort: true })
    .refine((value) => value.trim() <= todayForInput(), { error: 'La fecha de recepción no puede ser posterior a hoy.' }),
  quantityReceived: quantityField,
});
export type ReceiveDeliveryValues = z.input<typeof receiveDeliverySchema>;
