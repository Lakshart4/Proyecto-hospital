// Aplicación Express del Backend. Se exporta sin escuchar en ningún puerto para poder probarla
// con supertest; server.ts la conecta a un servidor HTTP.
//
// Orden: política CORS → lector de JSON (UTF-8) → cookies firmadas con SESSION_SECRET → rutas /api →
// 404 → manejador de errores.

import cookieParser from 'cookie-parser';
import express, { type Express, type Router } from 'express';
import { AttemptLimiter } from './middlewares/attemptLimiter';
import { corsPolicy } from './middlewares/cors';
import { errorHandler } from './middlewares/errorHandler';
import { notFound } from './middlewares/notFound';
import { createSecurity, type Security } from './middlewares/security';
import { defaultDatabase, type Database } from './repositories/database';
import { createApiRouter } from './routes';
import { createMailService, type MailService } from './mail/mail.service';
import { createAdminAuthorizationService } from './services/admin-authorization.service';
import { createDocumentFiles } from './lib/document-files';
import { createPhotoStorage } from './lib/photo-storage';
import { createAuthService } from './services/auth.service';
import { createDocumentsService } from './services/documents.service';
import { createPasswordRecoveryService } from './services/password-recovery.service';
import { createPatientsService } from './services/patients.service';
import { createStaffService } from './services/staff.service';
import { createNotificationsService } from './services/notifications.service';
import { createReportsService } from './services/reports.service';
import { createSettingsService } from './services/settings.service';
import { createOperationsRouter } from './routes/operations.routes';
import { createEquipmentService } from './services/equipment.service';
import { createDashboardService } from './services/dashboard.service';
import { createAuditService } from './services/audit.service';
import { createEquipmentRouter } from './routes/equipment.routes';
import { createDashboardRouter } from './routes/dashboard.routes';
import { createAuditRouter } from './routes/audit.routes';
import { createRoomsService } from './services/rooms.service';
import { createRoomsRouter } from './routes/rooms.routes';
import { createInventoryService } from './services/inventory.service';
import { createInventoryRouter } from './routes/inventory.routes';
import { createSuppliersService } from './services/suppliers.service';
import { createSuppliersRouter } from './routes/suppliers.routes';
import { createAppointmentsService } from './services/appointments.service';
import { createAppointmentsRouter } from './routes/appointments.routes';

const DEFAULT_FRONTEND_URL = 'http://localhost:5173';

export interface AppOptions {
  /** Único origen permitido por CORS (CORS_ORIGIN). */
  corsOrigin: string;
  /** Secreto para firmar las cookies `sid` y `aid` (SESSION_SECRET, ya validado por loadEnv). */
  sessionSecret: string;
  /** Cookies con atributo Secure (producción). */
  secureCookies?: boolean;
  /** Dónde escribir los errores 500 (por defecto, console.error). */
  logError?: (message: string) => void;
  /** Cliente de base de datos; por defecto el compartido (DATABASE_URL). Las pruebas pasan uno temporal. */
  db?: Database;
  /** Reloj (por defecto, la hora actual). */
  now?: () => Date;
  /** Costo de bcrypt (por defecto 10; las pruebas usan 4). */
  bcryptCost?: number;
  /** Rutas adicionales protegidas con los middlewares de seguridad. */
  extraRoutes?: (router: Router, security: Security) => void;
  /** Servicio de correo; por defecto, Bandeja_Local de desarrollo. */
  mail?: MailService;
  /** URL del Frontend para los enlaces de recuperación (FRONTEND_URL). */
  frontendUrl?: string;
  /** Carpeta de las fotos de Perfil (por defecto backend/uploads/photos). Las pruebas pasan una temporal. */
  photosDir?: string;
  /** Carpeta de los documentos de Empleados (por defecto backend/storage/documents). Las pruebas pasan una temporal. */
  documentsDir?: string;
  /** Generador de contraseñas iniciales (solo para pruebas). */
  generateInitialPassword?: () => string;
}

export const JSON_BODY_LIMIT = '1mb';

export function createApp(options: AppOptions): Express {
  const app = express();
  app.disable('x-powered-by');

  const now = options.now ?? (() => new Date());
  const secureCookies = options.secureCookies ?? false;
  // Instancia propia del flujo de inicio de sesión (clave: IP); no se comparte con otros flujos.
  const loginLimiter = new AttemptLimiter();
  const auth = createAuthService({
    db: options.db ?? defaultDatabase,
    now,
    loginLimiter,
    ...(options.bcryptCost === undefined ? {} : { bcryptCost: options.bcryptCost }),
  });
  const security = createSecurity({ auth, secureCookies, now });
  // Cada flujo con su propia instancia: recuperación por IP y autorización administrativa por usuario.
  const recoveryLimiter = new AttemptLimiter();
  const adminAuthLimiter = new AttemptLimiter();
  const db = options.db ?? defaultDatabase;
  const recovery = createPasswordRecoveryService({
    db,
    now,
    mail: options.mail ?? createMailService({ nodeEnv: 'development', smtp: null }),
    frontendUrl: options.frontendUrl ?? DEFAULT_FRONTEND_URL,
    ...(options.bcryptCost === undefined ? {} : { bcryptCost: options.bcryptCost }),
  });
  const adminAuthorization = createAdminAuthorizationService({ db, now, limiter: adminAuthLimiter });
  const documentFiles = createDocumentFiles(options.documentsDir);
  const staff = createStaffService({
    db,
    photos: createPhotoStorage(options.photosDir),
    documents: documentFiles,
    ...(options.bcryptCost === undefined ? {} : { bcryptCost: options.bcryptCost }),
    ...(options.generateInitialPassword ? { generatePassword: options.generateInitialPassword } : {}),
  });
  const documents = createDocumentsService({ db, documents: documentFiles, now });
  const patients = createPatientsService({ db, now });
  const settings = createSettingsService(db);
  const notifications = createNotificationsService(db, now);
  const reports = createReportsService(db, now);
  const equipment = createEquipmentService({ db, now });
  const dashboard = createDashboardService({ db, now });
  const audit = createAuditService({ db });
  const rooms = createRoomsService({ db, now });
  const inventory = createInventoryService({ db, area: 'medical' });
  const suppliers = createSuppliersService({ db, now });
  const appointments = createAppointmentsService({ db, now });

  app.use(corsPolicy(options.corsOrigin));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser(options.sessionSecret));

  app.use(
    '/api',
    createApiRouter({
      auth,
      recovery,
      adminAuthorization,
      staff,
      documents,
      patients,
      security,
      loginLimiter,
      recoveryLimiter,
      adminAuthLimiter,
      secureCookies,
      extraRoutes: (router, routeSecurity) => {
        // Las rutas inyectadas por pruebas o integraciones especializadas tienen prioridad.
        options.extraRoutes?.(router, routeSecurity);
        router.use(createRoomsRouter({ service: rooms, security: routeSecurity }));
        router.use(createInventoryRouter({ service: inventory, security: routeSecurity, area: 'medical' }));
        router.use(createSuppliersRouter({ service: suppliers, security: routeSecurity }));
        router.use(createAppointmentsRouter({ service: appointments, security: routeSecurity }));
        router.use(createEquipmentRouter({ service: equipment, security: routeSecurity }));
        router.use(createDashboardRouter({ service: dashboard, security: routeSecurity }));
        router.use(createAuditRouter({ service: audit, security: routeSecurity }));
        router.use(createOperationsRouter({ notifications, reports, settings, security: routeSecurity, now }));
      },
    }),
  );

  app.use(notFound);
  app.use(errorHandler(options.logError ? { log: options.logError } : {}));
  return app;
}
