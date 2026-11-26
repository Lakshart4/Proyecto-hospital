// Rutas /api/staff, /api/departments y /api/uploads/photos (Req. 5, 13).
//
// Orden en cada ruta: authenticate (401) → requirePasswordChange → authorize (403) → alcance (403) →
// validate (400) → controlador (404/409). Un Empleado solo llega a su propio Perfil; la consulta de otro
// Perfil responde 403 sin comprobar siquiera si existe. Con `mustChangePassword` verdadero, requirePasswordChange
// bloquea todas estas rutas hasta que la cuenta cambie su contraseña inicial (Req. 5.12).

import { Router, type RequestHandler } from 'express';
import { createStaffController } from '../controllers/staff.controller';
import { canEditOwnProfile } from '../domain/permissions';
import { ForbiddenError, ValidationError } from '../lib/errors';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { photoUpload } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import { parseIntegerString } from '../domain/others';
import { idParamSchema, PATCH_ME_KEYS, patchMeBodySchema, scheduleBodySchema, staffBodySchema, staffListQuerySchema } from '../schemas/staff';
import type { StaffService } from '../services/staff.service';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Un Empleado solo accede al `:id` de su propia cuenta; el ADMIN accede a cualquiera (Req. 5.6, 5.9). */
const requireSelfOrAdmin: RequestHandler = (req, _res, next) => {
  if (!req.auth) return next(new ForbiddenError());
  if (req.auth.user.role === 'ADMIN') return next();
  const id = parseIntegerString(req.params.id);
  next(id !== null && id === req.auth.user.id ? undefined : new ForbiddenError());
};

/**
 * PATCH /staff/me solo acepta `phone` y `photoUrl` (Req. 5.7, 5.8, Property 7). Cualquier otra clave
 * (cargo, correo, ID interno, Departamento, Rol, años de experiencia, Turno, contraseña, horario…) da 403
 * sin cambios; un cuerpo que no es un objeto o no trae ningún campo da 400.
 */
const restrictOwnProfileBody: RequestHandler = (req, _res, next) => {
  const body: unknown = req.body;
  if (!isPlainObject(body) || Object.keys(body).length === 0) {
    return next(new ValidationError('Los datos enviados no son válidos.', [{ field: 'body', message: 'Indica al menos un campo: phone o photoUrl.' }]));
  }
  const allowed: readonly string[] = PATCH_ME_KEYS;
  if (!canEditOwnProfile(body) || Object.keys(body).some((key) => !allowed.includes(key))) return next(new ForbiddenError());
  next();
};

export function createStaffRouter(deps: { service: StaffService; security: Security }): Router {
  const router = Router();
  const controller = createStaffController(deps.service);
  const { security } = deps;
  const session = [security.authenticate, security.requirePasswordChange];

  router.get('/staff', ...security.protect('staff', 'list'), validate({ query: staffListQuerySchema }), controller.list);
  router.post('/staff', ...security.protect('staff', 'create'), validate({ body: staffBodySchema }), controller.create);
  router.all('/staff', methodNotAllowed(['GET', 'HEAD', 'POST']));

  // Antes de /staff/:id para que "me" no se interprete como identificador.
  router.patch('/staff/me', ...security.protect('ownProfile', 'update'), restrictOwnProfileBody, validate({ body: patchMeBodySchema }), controller.patchMe);
  router.all('/staff/me', methodNotAllowed(['PATCH']));

  router.get('/staff/:id', ...security.protect('ownProfile', 'read'), requireSelfOrAdmin, validate({ params: idParamSchema }), controller.get);
  router.put('/staff/:id', ...security.protect('staff', 'update'), validate({ params: idParamSchema, body: staffBodySchema }), controller.update);
  router.delete('/staff/:id', ...security.protect('staff', 'delete'), validate({ params: idParamSchema }), controller.remove);
  router.all('/staff/:id', methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.put(
    '/staff/:id/schedule',
    ...security.protect('ownProfile', 'update'),
    requireSelfOrAdmin,
    validate({ params: idParamSchema, body: scheduleBodySchema }),
    controller.replaceSchedule,
  );
  router.all('/staff/:id/schedule', methodNotAllowed(['PUT']));

  router.post(
    '/staff/:id/photo',
    ...security.protect('ownProfile', 'update'),
    requireSelfOrAdmin,
    validate({ params: idParamSchema }),
    photoUpload(),
    controller.uploadPhoto,
  );
  router.all('/staff/:id/photo', methodNotAllowed(['POST']));

  // Las fotos las ven todos los roles autenticados (Perfiles, listas y barra superior), nunca el público.
  router.get('/uploads/photos/:filename', ...session, controller.photo);
  router.all('/uploads/photos/:filename', methodNotAllowed(['GET', 'HEAD']));

  router.get('/departments', ...session, controller.departments);
  router.all('/departments', methodNotAllowed(['GET', 'HEAD']));
  return router;
}
