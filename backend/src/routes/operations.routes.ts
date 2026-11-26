import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { addDays, dayRange, isNaturalDate, localDateOf } from '../domain/time';
import { UnauthenticatedError, ValidationError } from '../lib/errors';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { validate } from '../middlewares/validate';
import type { NotificationsService } from '../services/notifications.service';
import type { ReportsService } from '../services/reports.service';
import { SUPPORTED_TIME_ZONES, type SettingsService } from '../services/settings.service';

const settingsBodySchema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio.').max(120, 'El nombre no puede superar 120 caracteres.'),
  timeZone: z.string().trim().min(1, 'La zona horaria es obligatoria.').max(80),
}).strict();

const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
}).strict();

export interface OperationsRouterDeps {
  notifications: NotificationsService;
  reports: ReportsService;
  settings: SettingsService;
  security: Security;
  now?: () => Date;
}

export function createOperationsRouter(deps: OperationsRouterDeps): Router {
  const router = Router();
  const now = deps.now ?? (() => new Date());

  const listNotifications: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    const data = await deps.notifications.list({ id: req.auth.user.id, role: req.auth.user.role });
    res.status(200).json({ data, total: data.length });
  };
  router.get('/notifications', ...deps.security.protect('notifications', 'list'), listNotifications);
  router.all('/notifications', methodNotAllowed(['GET', 'HEAD']));

  const reportSummary: RequestHandler = async (req, res) => {
    const query = req.query as unknown as { from?: string; to?: string };
    const settings = await deps.settings.get();
    const today = localDateOf(now(), settings.timeZone);
    const fromText = query.from ?? addDays(today, -29);
    const toText = query.to ?? today;
    if (!isNaturalDate(fromText) || !isNaturalDate(toText)) {
      throw new ValidationError('Las fechas del reporte no son válidas.', [{ field: !isNaturalDate(fromText) ? 'from' : 'to', message: 'Usa el formato AAAA-MM-DD.' }]);
    }
    const from = dayRange(fromText, settings.timeZone).start;
    const to = dayRange(toText, settings.timeZone).end;
    if (from.getTime() > to.getTime()) throw new ValidationError('El rango de fechas no es válido.', [{ field: 'from', message: 'La fecha inicial no puede ser posterior a la final.' }]);
    res.status(200).json({ data: await deps.reports.summary({ from, to }) });
  };
  router.get('/reports/summary', ...deps.security.protect('reports', 'read'), validate({ query: reportQuerySchema }), reportSummary);
  router.all('/reports/summary', methodNotAllowed(['GET', 'HEAD']));

  const getSettings: RequestHandler = async (_req, res) => {
    res.status(200).json({ data: await deps.settings.get(), supportedTimeZones: SUPPORTED_TIME_ZONES });
  };
  const updateSettings: RequestHandler = async (req, res) => {
    if (!req.auth) throw new UnauthenticatedError();
    res.status(200).json({ data: await deps.settings.update(req.auth.user.id, req.body as { name: string; timeZone: string }) });
  };
  router.get('/settings/institution', ...deps.security.protect('settings', 'read'), getSettings);
  router.put('/settings/institution', ...deps.security.protect('settings', 'update'), validate({ body: settingsBodySchema }), updateSettings);
  router.all('/settings/institution', methodNotAllowed(['GET', 'HEAD', 'PUT']));
  return router;
}
