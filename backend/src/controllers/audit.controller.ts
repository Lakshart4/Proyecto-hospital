// Controlador de consulta de la Bitácora_de_Auditoría (Req. 12).

import type { RequestHandler } from 'express';
import type { AuditListQuery } from '../schemas/audit';
import type { AuditService } from '../services/audit.service';

export function createAuditController(service: AuditService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(req.query as unknown as AuditListQuery));
  };

  return { list };
}
