// Estado del Backend. No consulta la base de datos ni expone datos internos.

import type { RequestHandler } from 'express';

export const getHealth: RequestHandler = (_req, res) => {
  res.status(200).json({ status: 'ok' });
};
