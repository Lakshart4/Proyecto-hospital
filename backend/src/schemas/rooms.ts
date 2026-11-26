// Esquemas zod de Habitaciones, Asignaciones, liberaciones e Historial_de_Ocupación (Req. 9, 27).

import { z } from 'zod';
import { RELEASE_REASONS, ROOM_AVAILABILITY } from '../domain/constants';
import {
  intInRange,
  optionalQueryIntInRange,
  queryDateField,
  queryIntInRange,
} from './common';

const MAX_ID = 2_147_483_647;

export const ROOM_NUMBER_MESSAGE = 'El número de habitación debe ser un entero entre 1 y 9999.';
export const ROOM_CAPACITY_MESSAGE = 'La capacidad debe ser un entero entre 1 y 10.';
export const RELEASE_REASON_MESSAGE = 'El motivo debe ser "alta" o "fallecimiento".';

export const roomIdParamSchema = z.object({ id: queryIntInRange(1, MAX_ID) });

export const roomListQuerySchema = z
  .object({
    departmentId: optionalQueryIntInRange(1, MAX_ID),
    availability: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(ROOM_AVAILABILITY, { error: 'La disponibilidad debe ser "disponible" u "ocupada".' }).optional(),
    ),
  })
  .passthrough();

export type RoomListQuery = z.infer<typeof roomListQuerySchema>;

export const roomBodySchema = z.object({
  number: intInRange(1, 9999, { invalid: ROOM_NUMBER_MESSAGE }),
  departmentId: intInRange(1, MAX_ID),
  capacity: intInRange(1, 10, { invalid: ROOM_CAPACITY_MESSAGE }),
});

export type RoomBody = z.infer<typeof roomBodySchema>;

export const assignmentBodySchema = z.object({ patientId: intInRange(1, MAX_ID) });
export type AssignmentBody = z.infer<typeof assignmentBodySchema>;

export const releaseBodySchema = z.object({
  patientId: intInRange(1, MAX_ID),
  reason: z.enum(RELEASE_REASONS, { error: RELEASE_REASON_MESSAGE }),
  note: z.string({ error: 'Debe ser un texto.' }).trim().max(500, 'Debe tener como máximo 500 caracteres.').default(''),
});

export type ReleaseBody = z.infer<typeof releaseBodySchema>;

export const occupancyListQuerySchema = z
  .object({
    departmentId: optionalQueryIntInRange(1, MAX_ID),
    roomId: optionalQueryIntInRange(1, MAX_ID),
    reason: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(RELEASE_REASONS, { error: RELEASE_REASON_MESSAGE }).optional(),
    ),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type OccupancyListQuery = z.infer<typeof occupancyListQuerySchema>;

export const occupancySummaryQuerySchema = z
  .object({
    departmentId: optionalQueryIntInRange(1, MAX_ID),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type OccupancySummaryQuery = z.infer<typeof occupancySummaryQuerySchema>;
