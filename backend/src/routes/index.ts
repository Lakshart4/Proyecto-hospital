// Rutas de la API, montadas bajo /api en app.ts. Cada módulo agrega aquí su router.

import { Router } from 'express';
import type { AttemptLimiter } from '../middlewares/attemptLimiter';
import type { Security } from '../middlewares/security';
import type { AdminAuthorizationService } from '../services/admin-authorization.service';
import { createAdminAuthorizationRouter } from './admin-authorization.routes';
import { createAuthRouter, type AuthRouterDeps } from './auth.routes';
import { createHealthRouter } from './health.routes';
import { createStaffRouter } from './staff.routes';
import { createDocumentsRouter } from './documents.routes';
import { createPatientsRouter } from './patients.routes';
import type { DocumentsService } from '../services/documents.service';
import type { PatientsService } from '../services/patients.service';
import type { StaffService } from '../services/staff.service';

export interface ApiRouterDeps extends AuthRouterDeps {
  adminAuthorization: AdminAuthorizationService;
  /** Personal, Departamentos, Horario_de_Trabajo y fotos de Perfil. */
  staff: StaffService;
  /** Documentos_de_Empleado y Apartado_Privado. */
  documents: DocumentsService;
  /** Pacientes, movimientos y Tratamientos_Programados. */
  patients: PatientsService;
  /** Límite propio de la autorización administrativa (clave: usuario). */
  adminAuthLimiter: AttemptLimiter;
  /** Rutas adicionales con los middlewares de seguridad (módulos posteriores y pruebas). */
  extraRoutes?: (router: Router, security: Security) => void;
}

export function createApiRouter(deps: ApiRouterDeps): Router {
  const router = Router();
  router.use(createHealthRouter());
  router.use(createAuthRouter(deps));
  router.use(
    createAdminAuthorizationRouter({
      service: deps.adminAuthorization,
      security: deps.security,
      limiter: deps.adminAuthLimiter,
      secureCookies: deps.secureCookies,
    }),
  );
  router.use(createStaffRouter({ service: deps.staff, security: deps.security }));
  router.use(createDocumentsRouter({ service: deps.documents, security: deps.security }));
  router.use(createPatientsRouter({ service: deps.patients, security: deps.security }));
  deps.extraRoutes?.(router, deps.security);
  return router;
}
