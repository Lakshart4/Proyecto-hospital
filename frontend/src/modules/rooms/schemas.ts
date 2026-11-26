import { z } from 'zod';

export const ROOM_AVAILABILITIES = ['disponible', 'ocupada'] as const;
export const RELEASE_REASONS = ['alta', 'fallecimiento'] as const;

const integerField = (min: number, max: number, label: string) =>
  z.string().refine((value) => /^\d+$/.test(value.trim()) && Number(value.trim()) >= min && Number(value.trim()) <= max, {
    error: `${label} debe ser un número entero entre ${min} y ${max}.`,
  });

export const roomFormSchema = z.object({
  number: integerField(1, 9999, 'El número de habitación'),
  departmentId: z.string().refine((value) => /^\d+$/.test(value) && Number(value) >= 1, {
    error: 'Selecciona un departamento.',
  }),
  capacity: integerField(1, 10, 'La capacidad'),
});

export type RoomFormValues = z.input<typeof roomFormSchema>;
