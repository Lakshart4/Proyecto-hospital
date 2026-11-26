// Controlador del Dashboard administrativo (Req. 4).

import type { RequestHandler } from 'express';
import type { DashboardService } from '../services/dashboard.service';

export function createDashboardController(service: DashboardService) {
  const get: RequestHandler = async (_req, res) => {
    res.status(200).json(await service.get());
  };

  return { get };
}
