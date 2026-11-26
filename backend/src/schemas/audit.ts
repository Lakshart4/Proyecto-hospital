// Esquemas de consulta de la Bitácora_de_Auditoría (Req. 12.3, 12.4, 13.6).

import { z } from 'zod';
import { AUDIT_ACTIONS } from '../domain/constants';
import { optionalQueryIntInRange, queryDateField } from './common';

const MAX_ID = 2_147_483_647;

export const AUDIT_ACTION_MESSAGE = 'La acción de auditoría no es válida.';

export const auditListQuerySchema = z
  .object({
    userId: optionalQueryIntInRange(1, MAX_ID),
    action: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.enum(AUDIT_ACTIONS, { error: AUDIT_ACTION_MESSAGE }).optional(),
    ),
    from: queryDateField(),
    to: queryDateField(),
  })
  .passthrough();

export type AuditListQuery = z.infer<typeof auditListQuerySchema>;
