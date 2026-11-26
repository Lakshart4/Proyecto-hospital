// Rutas de Documentos_de_Empleado y Apartado_Privado (Req. 18.5, 19, 13.1).
//
// - /me/documents y /me/documents/:docId/file: solo documentos del Empleado autenticado.
// - /staff/:id/documents, /documents/:docId, /documents/:docId/file: ADMIN con Autorización_Administrativa vigente.

import { Router } from 'express';
import { createDocumentsController } from '../controllers/documents.controller';
import { methodNotAllowed } from '../middlewares/methodNotAllowed';
import type { Security } from '../middlewares/security';
import { pdfUpload } from '../middlewares/upload';
import { validate } from '../middlewares/validate';
import { docIdParamSchema, documentBodySchema } from '../schemas/documents';
import { idParamSchema } from '../schemas/staff';
import type { DocumentsService } from '../services/documents.service';

export function createDocumentsRouter(deps: { service: DocumentsService; security: Security }): Router {
  const router = Router();
  const controller = createDocumentsController(deps.service);
  const { security } = deps;

  const adminDocs = (action: 'list' | 'read' | 'create' | 'update' | 'delete') => [
    ...security.protect('employeeDocuments', action),
    security.requireAdminAuthorization,
  ];

  // Apartado_Privado (propios)
  router.get('/me/documents', ...security.protect('ownDocuments', 'list'), controller.listOwn);
  router.all('/me/documents', methodNotAllowed(['GET', 'HEAD']));

  router.get(
    '/me/documents/:docId/file',
    ...security.protect('ownDocuments', 'read'),
    validate({ params: docIdParamSchema }),
    controller.downloadOwn,
  );
  router.all('/me/documents/:docId/file', methodNotAllowed(['GET', 'HEAD']));

  // Gestión administrativa de Documentos_de_Empleado
  router.get(
    '/staff/:id/documents',
    ...adminDocs('list'),
    validate({ params: idParamSchema }),
    controller.listForEmployee,
  );
  router.post(
    '/staff/:id/documents',
    ...adminDocs('create'),
    validate({ params: idParamSchema }),
    pdfUpload(),
    validate({ body: documentBodySchema }),
    controller.upload,
  );
  router.all('/staff/:id/documents', methodNotAllowed(['GET', 'HEAD', 'POST']));

  router.get('/documents/:docId', ...adminDocs('read'), validate({ params: docIdParamSchema }), controller.get);
  router.put(
    '/documents/:docId',
    ...adminDocs('update'),
    validate({ params: docIdParamSchema }),
    pdfUpload(),
    validate({ body: documentBodySchema }),
    controller.replace,
  );
  router.delete('/documents/:docId', ...adminDocs('delete'), validate({ params: docIdParamSchema }), controller.remove);
  router.all('/documents/:docId', methodNotAllowed(['GET', 'HEAD', 'PUT', 'DELETE']));

  router.get(
    '/documents/:docId/file',
    ...adminDocs('read'),
    validate({ params: docIdParamSchema }),
    controller.download,
  );
  router.all('/documents/:docId/file', methodNotAllowed(['GET', 'HEAD']));

  return router;
}
