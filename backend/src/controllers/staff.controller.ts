// Controlador de Personal: traduce HTTP a llamadas del servicio (Req. 5, 13.1, 13.2).

import type { Request, RequestHandler } from 'express';
import { isValidPhotoFilename } from '../domain/staff';
import { NotFoundError, UnauthenticatedError } from '../lib/errors';
import type { PatchMeBody, ScheduleBody, StaffBody, StaffListQuery } from '../schemas/staff';
import type { Actor, StaffService } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;

export function createStaffController(service: StaffService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.list(req.query as unknown as StaffListQuery) });
  };

  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.get(actorOf(req), idOf(req)) });
  };

  /** La contraseña inicial solo viaja en esta respuesta y no se guarda en caché (Req. 5.12). */
  const create: RequestHandler = async (req, res) => {
    const { profile, initialPassword } = await service.create(actorOf(req), req.body as StaffBody);
    res.set('Cache-Control', 'no-store');
    res.status(201).json({ data: profile, initialPassword });
  };

  const update: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.update(actorOf(req), idOf(req), req.body as StaffBody) });
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(actorOf(req), idOf(req));
    res.status(204).end();
  };

  const patchMe: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.patchOwnProfile(actorOf(req), req.body as PatchMeBody) });
  };

  const replaceSchedule: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.replaceSchedule(actorOf(req), idOf(req), req.body as ScheduleBody) });
  };

  const uploadPhoto: RequestHandler = async (req, res) => {
    const file = req.file;
    const upload = file ? { buffer: file.buffer, size: file.size, mimetype: file.mimetype } : undefined;
    res.status(200).json({ data: await service.uploadPhoto(actorOf(req), idOf(req), upload) });
  };

  /** Entrega una foto cargada. Nombres que no sean UUID con extensión jpg o png responden 404 sin tocar el disco. */
  const photo: RequestHandler = async (req, res) => {
    const filename = req.params.filename;
    if (!isValidPhotoFilename(filename)) throw new NotFoundError();
    const result = await service.readPhoto(filename);
    if (result === null) throw new NotFoundError();
    res.set({
      'Content-Type': result.contentType,
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=300',
    });
    res.status(200).end(Buffer.from(result.content));
  };

  const departments: RequestHandler = async (_req, res) => {
    res.status(200).json({ data: await service.departments() });
  };

  return { list, get, create, update, remove, patchMe, replaceSchedule, uploadPhoto, photo, departments };
}
