# Implementation Plan: Sistema de Gestión y Administración Hospitalaria

## Overview

El plan cubre los Requisitos 1 a 28 y las 44 propiedades del diseño. Se divide en siete etapas ordenadas: (1) configuración inicial, (2) base de datos, (3) reglas de dominio puras, (4) autenticación, recuperación, permisos y autorización administrativa, (5) frontend base y diseño, (6) módulos funcionales en el orden del diseño (Req. 16.10) y (7) integración y pruebas. El lenguaje de implementación es TypeScript (modo `strict`) en ambos proyectos. Cada tarea indica su **Objetivo** y, cuando aplica, su **Verificación**. Cada módulo de la etapa 6 deja el sistema ejecutable sin los siguientes, con el backend primero y su pantalla después.

Cambios respecto a la versión anterior del plan: el inventario de limpieza es un recurso propio (`/api/cleaning-inventory`); los permisos de Médicos y Enfermeros se detallan por campo; la liberación de habitaciones usa `POST /rooms/:id/releases` con motivo `alta` o `fallecimiento`; el límite de Tratamientos es 100 por Paciente; la página de inicio de Personal_de_Limpieza es `/inventario-limpieza`; y la numeración de propiedades sigue la del diseño actual (1 a 44).

## Tasks

- [x] 1. Configuración inicial
  - [x] 1.1 Crear la estructura raíz del repositorio
    - Objetivo: crear las carpetas `frontend` y `backend` independientes, `.gitignore` (incluye `.env`, `node_modules`, `*.db`, `backend/storage/documents`, `backend/uploads`) y un `README.md` esqueleto en español con los títulos Instalación, Migración, Semilla, Ejecución, Bandeja_Local y Cuentas demo.
    - Verificación: existen exactamente dos carpetas de código en la raíz; `.env`, la base SQLite y los archivos cargados quedan ignorados por git.
    - _Requirements: 16.1, 16.8_

  - [x] 1.2 Inicializar el proyecto backend
    - Objetivo: crear `backend/package.json`, `tsconfig.json` con `"strict": true`, dependencias (express, cors, cookie-parser, zod, bcrypt, prisma, @prisma/client, multer, nodemailer) y de desarrollo (vitest, supertest, fast-check, tsx, tipos), con scripts `dev`, `build`, `test` (`vitest --run`), `seed` y `migrate`; crear la estructura de carpetas `routes`, `controllers`, `services`, `repositories`, `domain`, `schemas`, `middlewares`, `mail`, `lib`, `tests/{unit,property,integration}`.
    - Verificación: `npx tsc --noEmit` en `backend` termina sin errores y no requiere archivos de `frontend`.
    - _Requirements: 16.1, 16.2, 16.4_

  - [x] 1.3 Inicializar el proyecto frontend
    - Objetivo: crear `frontend` con Vite + React + TypeScript `strict`, Tailwind CSS, React Router, zod, lucide-react, Vitest y React Testing Library; configurar el proxy `/api` en `vite.config.ts` y la estructura `app`, `shared`, `modules`, `styles`.
    - Verificación: `npx tsc --noEmit` y `npm run build` en `frontend` terminan sin errores sin tocar `backend`.
    - _Requirements: 16.1, 16.3, 16.4, 15.2_

  - [x] 1.4 Implementar `config/env.ts` y los archivos `.env.example`
    - Objetivo: `loadEnv` exige `SESSION_SECRET`, `DATABASE_URL` y `CORS_ORIGIN` y acepta como opcionales `PORT`, `NODE_ENV`, `FRONTEND_URL`, `NAGER_ENABLED`, `NAGER_COUNTRY`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` y `DEMO_*_PASSWORD`; aborta con `exit(1)` nombrando cada variable faltante; crear `backend/.env.example` y `frontend/.env.example` (`VITE_API_URL`) sin valores sensibles.
    - Verificación: iniciar el backend sin `SESSION_SECRET` imprime ese nombre y termina con código distinto de cero; los ejemplos listan todas las variables sin secretos reales.
    - _Requirements: 16.5, 16.6, 16.7, 17.11_

  - [x]* 1.5 Escribir prueba de propiedades para `loadEnv`
    - **Property 42: Variables de entorno requeridas**
    - **Validates: Requirements 16.6, 17.11**

- [x] 2. Base de datos
  - [x] 2.1 Definir `schema.prisma` completo y generar la migración
    - Objetivo: modelar Department, User (con `mustChangePassword`, `active`, `description`, `birthDate`, `shift` matutino/vespertino), ScheduleSlot (con comida) y ScheduleBreak, Session, PasswordResetToken, AdminAuthorization, EmployeeDocument, Patient (con `deceasedAt` y observaciones con autor y fecha), PatientMovement, Treatment (tipo, estado, `performedAt`, `createdById`), Room, RoomAssignment (con `releaseReason`), Supplier, Product, MedicationInfo (principio activo, nombre comercial, clasificación de control, receta), SupplierDelivery, InventoryMovement, Equipment, MaintenanceRecord, Event, NonWorkingDay y AuditLog (`userId` opcional con `SetNull`), con restricciones únicas, índices y `onDelete` (`Restrict`/`Cascade`) del diseño; las constantes de valores permitidos viven en `domain/constants.ts`.
    - Verificación: `prisma validate` y `prisma migrate dev` crean la base SQLite; borrar un Departamento, Proveedor, Habitación, Producto, Equipo o Empleado con dependientes falla por `Restrict`; borrar una Sesión elimina su AdminAuthorization.
    - _Requirements: 14.6, 14.7, 5.2, 6.2, 7.2, 7.5, 7.12, 8.2, 9.2, 12.1, 17.2, 18.1, 19.1, 20.1, 22.2, 24.1, 25.1, 26.1, 27.3, 28.3_

  - [x] 2.2 Crear el cliente Prisma y la base de la capa de repositorios
    - Objetivo: `lib/prisma.ts` y `repositories/` con el helper `withTransaction`, único lugar que importa `@prisma/client`; `lib/errors.ts` con clases de error tipadas y traducción de `P2002`/`P2003` a 409 en español.
    - Verificación: ninguna ruta ni controlador importa Prisma; `withTransaction` revierte todo al lanzar una excepción.
    - _Requirements: 16.2, 3.6, 3.7, 14.7_

  - [x] 2.3 Implementar `prisma/seed.ts` ficticia, ampliada, idempotente y transaccional
    - Objetivo: sembrar en una sola `$transaction` con `upsert` por claves naturales: 6 Departamentos; cuentas ADMIN (Director) y 10 Empleados (≥2 DOCTOR, ≥2 NURSE, ≥2 CLEANING, ≥4 por Turno, con Horario_de_Trabajo, comida, Descansos y fecha de nacimiento); 20 Documentos_de_Empleado (contratación y acreditación, PDF ficticios en `storage/documents`); 12 Pacientes (7 activo, 3 dado de alta, 2 fallecido) con 17 movimientos y ≥12 Tratamientos (≥2 cirugías, ≥2 realizados); 20 Habitaciones con 5 Asignaciones cerradas (3 alta, 2 fallecimiento) y activas en el mismo Departamento; Proveedores; 20 Productos (≥5 por categoría) con datos de medicamento y subcategorías de insumo; 8 Entregas (4 recibidas, 3 programadas, 1 cancelada); 24 Movimientos de inventario; 12 Equipos (≥1 por Departamento y por Estado_Operativo) con 6 Registros_de_Mantenimiento (4 cerrados, 2 en curso); 3 Días_Inhábiles y Eventos de ejemplo. Todos los datos son ficticios (correos `example.com`). Las contraseñas se leen de `DEMO_*_PASSWORD` o se generan aleatoriamente, se imprimen una sola vez en consola y nunca aparecen en código, semilla ni Base_de_Datos en texto plano.
    - Verificación: ejecutar la semilla dos veces conserva las mismas cantidades, sin duplicados y con código 0; un fallo forzado revierte todo y muestra la causa; cada cuenta demo tiene contraseña distinta.
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.8, 14.9, 14.10, 1.7, 5.1, 6.1, 7.1, 8.1, 9.1_

  - [x]* 2.4 Escribir prueba de integración de la semilla
    - Objetivo: usar una base SQLite temporal con migraciones; comprobar conteos del Req. 14.1 y 14.10, idempotencia, rollback, coherencia de Departamento en Asignaciones, integridad referencial, contraseñas distintas y ausencia de contraseñas en el código.
    - _Requirements: 14.1, 14.2, 14.4, 14.5, 14.7, 14.8, 14.9, 14.10_

  - [x] 2.5 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Reglas de dominio puras y utilidades del backend
  - [x] 3.1 Crear `app.ts`, `server.ts` y middlewares de error y CORS
    - Objetivo: app Express exportable con JSON UTF-8, CORS solo para `CORS_ORIGIN` con credenciales, `notFound`, `errorHandler` con sobre `{ code, message, errors? }` en español (códigos del diseño) y 500 genérico sin trazas, `methodNotAllowed` (405) y `GET /api/health`.
    - Verificación: un origen ajeno no recibe cabeceras `Access-Control-*`; el preflight del origen permitido responde en menos de 500 ms; un error desconocido devuelve 500 sin traza, ruta ni SQL.
    - _Requirements: 13.3, 13.4, 13.8, 13.9, 13.10_

  - [x]* 3.2 Escribir prueba de propiedades del sobre de error
    - **Property 40: Sobre de error uniforme y sin fugas**
    - **Validates: Requirements 13.4, 13.8**

  - [x] 3.3 Implementar paginación, middleware `validate` y esquemas zod comunes
    - Objetivo: `parsePagination` (pageSize 1 a 100, por defecto 10), `middlewares/validate.ts` que devuelve 400 con `errors[]` por campo y helpers zod (`trim().min(1)`, enteros con rango).
    - Verificación: `pageSize=0`, `101` o `abc` producen 400; sin parámetros se obtiene página 1 y tamaño 10.
    - _Requirements: 13.6, 13.7, 3.3, 3.4_

  - [x]* 3.4 Escribir prueba de propiedades de paginación
    - **Property 41: Paginación**
    - **Validates: Requirements 13.6, 13.7**

  - [x] 3.5 Implementar reglas puras de stock y filtros
    - Objetivo: `domain/stock.ts` (`isLowStock`, `availabilityOf`, `inventoryScope`) y `domain/filters.ts` (`applyFilters` con AND, búsqueda sin distinguir mayúsculas, rangos de fechas inclusivos, filtros de medicamento y de movimientos) y `sortRows` del backend si aplica.
    - Verificación: `isLowStock(5,5)` es verdadero y `availabilityOf(0)` es `agotado`; sin filtros devuelve todo y sin coincidencias devuelve lista vacía.
    - _Requirements: 7.3, 7.4, 5.3, 6.5, 7.9, 8.6, 9.10, 12.4, 22.6, 24.7, 25.5, 26.6, 27.4_

  - [x]* 3.6 Escribir prueba de propiedades de stock
    - **Property 14: Stock bajo y agotado**
    - **Validates: Requirements 7.3, 7.4, 23.4**

  - [x]* 3.7 Escribir prueba de propiedades de filtros
    - **Property 6: Los filtros se combinan con AND**
    - **Validates: Requirements 5.3, 6.5, 7.9, 8.6, 9.10, 12.4, 22.6, 24.7, 25.5, 26.6, 27.4**

  - [x] 3.8 Implementar reglas puras de habitaciones y ocupación
    - Objetivo: `domain/rooms.ts` con `roomAvailability`, modelo puro de asignar y liberar (motivo `alta` o `fallecimiento`, errores de conflicto 409 y de validación 400) y `occupancySummary` por Departamento, más contadores ocupadas/disponibles.
    - Verificación: una habitación con activas = capacidad es `ocupada`; asignar y liberar restaura el estado previo; un motivo distinto de `alta`/`fallecimiento` se rechaza.
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.13, 27.1, 27.3, 27.5_

  - [x]* 3.9 Escribir prueba de propiedades de disponibilidad e invariantes de ocupación
    - **Property 18: Disponibilidad de Habitación e invariantes de ocupación**
    - **Validates: Requirements 9.3, 9.4, 9.9, 27.3**

  - [x]* 3.10 Escribir prueba de propiedades de conflictos de asignación
    - **Property 19: Conflictos de asignación sin efectos**
    - **Validates: Requirements 9.5, 9.6, 9.7, 9.8, 9.13**

  - [x]* 3.11 Escribir prueba de propiedades de contadores y resumen de ocupación
    - **Property 20: Contadores y resumen de ocupación**
    - **Validates: Requirements 27.1, 27.5**

  - [x] 3.12 Implementar reglas puras del estado del Paciente
    - Objetivo: `domain/patients.ts` con `nextPatientStatus` (alta, fallecimiento, reingreso; `fallecido` definitivo), `validDeathTime` y búsqueda de Pacientes por nombre o ID interno ordenada por ingreso descendente.
    - Verificación: `fallecido` con cualquier acción devuelve `CONFLICT`; un fallecimiento anterior al último ingreso es inválido.
    - _Requirements: 6.5, 6.13, 20.2, 20.3, 20.4, 20.5_

  - [x]* 3.13 Escribir prueba de propiedades de transiciones del estado del Paciente
    - **Property 12: Transiciones del estado del Paciente**
    - **Validates: Requirements 6.13, 20.2, 20.3, 20.4, 20.5**

  - [x]* 3.14 Escribir prueba de propiedades de búsqueda y orden de Pacientes
    - **Property 11: Búsqueda y orden de Pacientes**
    - **Validates: Requirements 6.5**

  - [x] 3.15 Implementar reglas puras de movimientos de inventario y entregas
    - Objetivo: `applyMovement` (entrada, salida, ajuste con `before`/`after`, rangos 0 a 999 999, errores `INSUFFICIENT`, `OVERFLOW`, `INVALID`), `receiveDelivery` y `transitionDelivery` (solo `programada` a `recibida` o `cancelada`).
    - Verificación: una salida mayor a la existente se rechaza sin cambiar la cantidad; recibir una entrega `cancelada` devuelve conflicto.
    - _Requirements: 7.7, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 25.1, 25.2, 25.3, 25.4_

  - [x]* 3.16 Escribir prueba de propiedades de conservación de cantidades
    - **Property 16: Conservación de cantidades de inventario**
    - **Validates: Requirements 7.7, 24.3, 24.4, 25.1, 25.2, 25.3**

  - [x]* 3.17 Escribir prueba de propiedades de entregas de proveedor
    - **Property 17: Entregas de proveedor**
    - **Validates: Requirements 24.1, 24.2, 24.3, 24.5, 24.6**

  - [x] 3.18 Implementar reglas puras de equipos y mantenimiento
    - Objetivo: `domain/equipment.ts` con `equipmentSummary` (celdas por categoría y Departamento, totales y total general) y `canOpenMaintenance` (un solo registro en curso).
    - Verificación: el total general es la suma de todas las cantidades; abrir un segundo mantenimiento en curso es rechazado.
    - _Requirements: 26.1, 26.2, 26.3, 26.7_

  - [x]* 3.19 Escribir prueba de propiedades del resumen de equipamiento
    - **Property 23: Resumen de equipamiento**
    - **Validates: Requirements 26.7**

  - [x]* 3.20 Escribir prueba de propiedades de mantenimiento de equipos
    - **Property 24: Mantenimiento de equipos**
    - **Validates: Requirements 26.1, 26.2, 26.3**

  - [x] 3.21 Implementar reglas puras de horario, archivos y fechas de documentos
    - Objetivo: `domain/schedule.ts` (`validateDaySchedule`: formato HH:mm, salida posterior a entrada, comida y máximo 3 Descansos dentro del intervalo, sin solapes) y `domain/files.ts` (`validateUpload` por firma de archivo para fotos JPEG/PNG ≤ 2 MB y PDF ≤ 5 MB; `validateDocumentDates`).
    - Verificación: un Descanso que se solapa con la comida produce un error en ese campo; un archivo con extensión PDF pero firma distinta se rechaza.
    - _Requirements: 5.13, 5.14, 5.15, 5.16, 19.1, 19.3_

  - [x]* 3.22 Escribir prueba de propiedades de validación del Horario_de_Trabajo
    - **Property 25: Validación del Horario_de_Trabajo**
    - **Validates: Requirements 5.15, 5.16**

  - [x]* 3.23 Escribir prueba de propiedades de validación de archivos y fechas
    - **Property 26: Validación de archivos y fechas de documentos**
    - **Validates: Requirements 5.13, 5.14, 19.1, 19.3**

  - [x] 3.24 Implementar reglas puras de calendarios y eventos
    - Objetivo: `domain/events.ts` con `overlaps`, `birthdayEvents` (29 de febrero a 28 en años no bisiestos), `upcomingWindow` (hoy a hoy+7, solo `entrega`, `actividad` y entregas `programada`, máx. 50), `shiftCalendar`, `generalCalendar` y calendario de actividades (excluyen entregas `cancelada`), validación de Evento y Día_Inhábil (título 1 a 150, fin ≥ inicio, fecha única) y `eventColor` con siete colores distintos.
    - Verificación: un evento que termina el día de inicio del rango solapa; los inactivos no generan cumpleaños ni turnos; una entrega cancelada no aparece.
    - _Requirements: 4.2, 4.3, 10.2, 10.4, 10.5, 10.9, 10.11, 11.2, 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.8_

  - [x]* 3.25 Escribir prueba de propiedades de la ventana de próximos eventos
    - **Property 22: Ventana de próximas entregas y actividades**
    - **Validates: Requirements 4.2, 4.3**

  - [x]* 3.26 Escribir prueba de propiedades de validez de Eventos y Días_Inhábiles
    - **Property 30: Validez de Eventos y Días_Inhábiles**
    - **Validates: Requirements 10.4, 10.9, 28.3, 28.4**

  - [x]* 3.27 Escribir prueba de propiedades de solape
    - **Property 31: Solape de Eventos con el período**
    - **Validates: Requirements 10.11, 28.6**

  - [x]* 3.28 Escribir prueba de propiedades de cumpleaños
    - **Property 32: Eventos de cumpleaños**
    - **Validates: Requirements 10.5**

  - [x]* 3.29 Escribir prueba de propiedades de composición de calendarios
    - **Property 33: Composición de los calendarios general y de actividades**
    - **Validates: Requirements 28.5, 28.6, 28.7**

  - [x]* 3.30 Escribir prueba de propiedades del Calendario_de_Turnos
    - **Property 34: Calendario_de_Turnos**
    - **Validates: Requirements 28.1, 28.2**

  - [x]* 3.31 Escribir prueba de propiedades de colores de Tipo_de_Evento
    - **Property 36: Colores de Tipo_de_Evento distintos**
    - **Validates: Requirements 10.2, 11.2, 28.8**

  - [x] 3.32 Implementar `domain/holidays.ts` y el servicio de feriados con caché
    - Objetivo: `parseYear` (entero 1900 a 2100) y servicio con `fetch` inyectable, `AbortController` de 3 s, caché de 24 h por año (solo éxitos) y respuesta `{ available, data }`.
    - Verificación: con `fetch` simulado que falla o supera 3 s se devuelve `available: false, data: []`; un año inválido no invoca `fetch`.
    - _Requirements: 11.1, 11.3, 11.5, 11.6, 16.9_

  - [x]* 3.33 Escribir prueba de propiedades del año de feriados
    - **Property 37: Validación del año de feriados**
    - **Validates: Requirements 11.1, 11.6**

  - [x]* 3.34 Escribir prueba de propiedades de la caché de feriados
    - **Property 38: Caché de feriados de 24 horas**
    - **Validates: Requirements 11.3, 11.5**

  - [x] 3.35 Implementar `domain/dashboard.ts`
    - Objetivo: `computeDashboardStats` con seis tarjetas enteras (Empleados, Pacientes activos, Habitaciones disponibles y ocupadas, Productos con Stock_Bajo de ambos inventarios, Equipos en mantenimiento), indicadores adicionales (dados de alta, fallecidos, fuera de servicio, agotados) y ocupación por Departamento con porcentaje entero `round(100 × ocupadas / total)`.
    - Verificación: sin Habitaciones en un Departamento el porcentaje es 0; los valores siempre son enteros ≥ 0.
    - _Requirements: 4.1, 4.4, 4.5, 4.9, 8.8, 23.6_

  - [x]* 3.36 Escribir prueba de propiedades de estadísticas del dashboard
    - **Property 21: Estadísticas e indicadores del dashboard**
    - **Validates: Requirements 4.1, 4.4, 4.5, 4.9, 8.8, 23.6**

  - [x] 3.37 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Autenticación, recuperación, permisos y autorización administrativa
  - [x] 4.1 Implementar utilidades de contraseña y sesión
    - Objetivo: `lib/password.ts` (bcrypt, costo 10 y 4 en pruebas), reglas puras de cambio y restablecimiento (nueva de 8 a 128 caracteres), `lib/tokens.ts` (token de 32 bytes, hash SHA-256) e `isSessionExpired` (más de 30 min).
    - Verificación: el hash difiere del texto plano y verifica correctamente; una sesión con 30 min exactos no expira y con más sí.
    - _Requirements: 1.3, 1.5, 1.8, 1.9, 17.5, 17.7_

  - [x]* 4.2 Escribir prueba de propiedades del hash de contraseña
    - **Property 1: Hash de contraseña**
    - **Validates: Requirements 1.3, 1.7**

  - [x]* 4.3 Escribir prueba de propiedades de expiración de sesión
    - **Property 2: Expiración de sesión por inactividad**
    - **Validates: Requirements 1.5**

  - [x] 4.4 Implementar `AttemptLimiter`
    - Objetivo: contar fallos por clave (IP en login y recuperación, userId en autorización administrativa) en ventana de 15 min en memoria; bloqueo al quinto fallo durante 15 min; `reset` tras éxito; reloj inyectable.
    - Verificación: 5 fallos bloquean a esa clave y no a otra; pasados 15 min desde el quinto fallo se libera.
    - _Requirements: 1.10, 17.8, 18.4_

  - [x]* 4.5 Escribir prueba de propiedades del límite de intentos
    - **Property 29: Límite de intentos fallidos**
    - **Validates: Requirements 1.10, 17.8, 18.4**

  - [x] 4.6 Implementar `domain/permissions.ts` y reglas de alcance
    - Objetivo: `can(rol, recurso, acción)` según la matriz del diseño (incluye `cleaningInventory`, `employeeDocuments`, `ownDocuments`, `adminAuthorization`, `shifts`); `canUpdatePatientField` (`ALLOW`/`FORBIDDEN`/`CONFLICT` por rol, responsable, estado y campo), `patientScope`, `inventoryScope` por área, validación del rol de médico y enfermero responsables, campos editables del Perfil propio y propiedad de la agenda individual.
    - Verificación: ADMIN accede a todo; CLEANING solo lee `cleaningInventory`; un Médico no responsable recibe `FORBIDDEN`; un responsable sobre un Paciente `dado de alta` recibe `CONFLICT`.
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 2.7, 2.10, 5.7, 5.8, 6.6, 6.7, 6.8, 6.9, 6.10, 6.12, 7.10, 10.8, 10.10, 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7, 23.5_

  - [x]* 4.7 Escribir prueba de propiedades de la matriz de permisos
    - **Property 4: Matriz de permisos por rol**
    - **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 4.7, 7.11, 8.10, 9.12, 12.5, 18.6, 23.5, 24.9, 25.9, 26.9, 27.6**

  - [x]* 4.8 Escribir prueba de propiedades del alcance de Pacientes
    - **Property 9: Alcance de Pacientes por responsable**
    - **Validates: Requirements 6.6, 6.7, 6.12, 20.6, 20.7**

  - [x]* 4.9 Escribir prueba de propiedades del rol del responsable
    - **Property 10: Rol requerido del responsable**
    - **Validates: Requirements 6.8, 6.9, 6.10**

  - [x]* 4.10 Escribir prueba de propiedades del alcance de los inventarios
    - **Property 15: Alcance de los inventarios médico y de limpieza**
    - **Validates: Requirements 7.9, 7.10, 2.6, 23.2, 23.5**

  - [x]* 4.11 Escribir prueba de propiedades de permisos de actualización de Médicos y Enfermeros
    - **Property 13: Permisos de actualización de Médicos y Enfermeros**
    - **Validates: Requirements 21.1, 21.2, 21.3, 21.4, 21.5, 21.6, 21.7**

  - [x]* 4.12 Escribir prueba de propiedades de campos editables del Perfil
    - **Property 7: Campos editables del Perfil propio**
    - **Validates: Requirements 5.7, 5.8**

  - [x]* 4.13 Escribir prueba de propiedades de la agenda individual
    - **Property 35: Propiedad de la agenda individual**
    - **Validates: Requirements 10.8, 10.10**

  - [x] 4.14 Implementar `domain/tokens.ts` (vigencia de tokens y autorización)
    - Objetivo: `isResetTokenUsable` (hash coincide, no usado, ≤ 30 min) e `isAdminAuthorizationValid` (misma Sesión, no revocada, < 10 min), con reloj inyectado.
    - Verificación: un token usado o vencido no es utilizable; una autorización de otra Sesión es inválida.
    - _Requirements: 17.2, 17.5, 17.6, 18.1, 18.5, 18.7, 18.8_

  - [x]* 4.15 Escribir prueba de propiedades de vigencia del Token_de_Recuperación
    - **Property 27: Vigencia del Token_de_Recuperación**
    - **Validates: Requirements 17.2, 17.5, 17.6**

  - [x]* 4.16 Escribir prueba de propiedades de vigencia de la Autorización_Administrativa
    - **Property 28: Vigencia de la Autorización_Administrativa**
    - **Validates: Requirements 18.1, 18.5, 18.7, 18.8**

  - [x] 4.17 Implementar el saneador y el escritor de auditoría
    - Objetivo: `sanitizeAuditDetails` y `writeAudit` en repositorios, ejecutado en la misma transacción que la operación con `userId` opcional; si falla, se revierte la operación y se responde 500 "La operación no se completó."; las acciones se limitan a la lista del Req. 12.2.
    - Verificación: los detalles no contienen contraseñas, hashes, tokens de recuperación, autorizaciones ni tokens de sesión a ninguna profundidad; un fallo forzado no deja cambios parciales.
    - _Requirements: 12.1, 12.2, 12.6, 12.8, 18.2, 17.9_

  - [x]* 4.18 Escribir prueba de propiedades del saneador de auditoría
    - **Property 39: Auditoría sin datos secretos**
    - **Validates: Requirements 12.6, 18.2, 17.9**

  - [x] 4.19 Implementar los middlewares de seguridad y conectarlos a `app.ts`
    - Objetivo: `cookie-parser` con secreto, `authenticate` (sesión por hash, expiración por inactividad, `lastActivityAt`), `authorize(recurso, acción)`, `requirePasswordChange` (403 `PASSWORD_CHANGE_REQUIRED` salvo `/auth/me`, `/auth/logout`, `/auth/change-password`), `requireAdminAuthorization` y `attemptLimiter`; respetar el orden 401 → 403 → autorización administrativa → alcance → 400 → 404/409.
    - Verificación: sin cookie válida se responde 401 sin datos; un rol no permitido recibe 403 sin datos del recurso.
    - _Requirements: 1.5, 1.6, 2.1, 2.2, 2.7, 5.12, 18.5_

  - [x] 4.20 Implementar el módulo `auth` (rutas, controlador, servicio, esquemas)
    - Objetivo: `POST /auth/login` (límite por IP antes de comparar, hash ficticio si el usuario no existe, cookie `sid` HttpOnly, SameSite=Strict, Secure en producción, 401 genérico, auditoría de éxito y fallo), `POST /auth/logout`, `GET /auth/me` y `POST /auth/change-password` (8 a 128 caracteres, conserva la Sesión actual, invalida las demás y las Autorizaciones_Administrativas, audita `PASSWORD_CHANGE`).
    - Verificación: login válido fija la cookie correcta; el `sid` usado tras logout recibe 401; una contraseña nueva de 7 caracteres se rechaza con mensaje y el hash no cambia.
    - _Requirements: 1.1, 1.2, 1.4, 1.7, 1.8, 1.9, 1.10, 1.11, 12.2, 13.1_

  - [x]* 4.21 Escribir prueba de propiedades de validación de cambio y restablecimiento de contraseña
    - **Property 3: Validación de cambio y restablecimiento de contraseña**
    - **Validates: Requirements 1.8, 1.9, 17.5, 17.7**

  - [x] 4.22 Implementar `MailService` y la Bandeja_Local
    - Objetivo: interfaz `MailTransport`, `SmtpTransport` (nodemailer), `LocalOutboxTransport` (escribe destinatario, asunto y enlace en consola y los conserva en memoria) y `createMailService(env)` que elige SMTP si las cinco variables existen, Bandeja_Local si no y `NODE_ENV !== 'production'`, y solo una advertencia en producción sin SMTP; plantillas en español.
    - Verificación: sin variables SMTP el correo aparece en la consola del Backend; con SMTP completo se usa el transporte SMTP (simulado en pruebas).
    - _Requirements: 17.3, 17.4, 17.11, 16.8, 16.9_

  - [x] 4.23 Implementar la recuperación de contraseña
    - Objetivo: `POST /auth/forgot-password` (límite 5/15 min por IP, mismo 200 exista o no la cuenta, token de ≥ 32 bytes con solo `sha256` guardado, vigencia de 30 min, invalida tokens previos, envía el enlace `FRONTEND_URL/restablecer?token=` con `MailService`, audita sin token) y `POST /auth/reset-password` (token vigente y no usado, contraseña de 8 a 128 caracteres, marca `usedAt`, `mustChangePassword=false`, invalida todas las Sesiones, audita; contraseña inválida no consume el token).
    - Verificación: la respuesta es idéntica con correo existente e inexistente; un token usado o vencido devuelve 400; la sexta solicitud en 15 min devuelve 429.
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6, 17.7, 17.8, 17.9, 12.2_

  - [x] 4.24 Implementar la Autorización_Administrativa
    - Objetivo: `POST /admin-authorization` (solo ADMIN, contraseña propia, límite por `userId`, token aleatorio con solo hash guardado, vigencia de 10 min ligada a la Sesión, cookie `aid` HttpOnly SameSite=Strict, auditoría de otorgamiento y rechazo), `GET /admin-authorization` y `DELETE /admin-authorization` (revoca); se invalida al cerrar o expirar la Sesión, cambiar contraseña o revocar.
    - Verificación: contraseña incorrecta devuelve 401 y se audita el rechazo; el quinto fallo bloquea con 429 incluso con la contraseña correcta; un rol distinto de ADMIN recibe 403.
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.6, 18.7, 18.8, 18.10, 12.2_

  - [x]* 4.25 Escribir pruebas de integración de autenticación, recuperación y autorización administrativa
    - Objetivo: con `supertest`, cubrir login válido e inválido, logout, expiración, bloqueo 429, `PASSWORD_CHANGE_REQUIRED`, recuperación completa con lectura del enlace en la Bandeja_Local, invalidación de Sesiones tras el restablecimiento y el ciclo de la Autorización_Administrativa (otorgada, vencida sin cerrar la Sesión, revocada).
    - _Requirements: 1.1, 1.2, 1.4, 1.5, 1.6, 1.10, 1.11, 5.12, 17.1, 17.5, 17.6, 17.8, 18.1, 18.3, 18.5, 18.7, 18.8_

  - [x] 4.26 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Frontend base y diseño en español
  - [x] 5.1 Configurar el tema visual, los textos en español y el contraste
    - Objetivo: paleta en `tailwind.config.ts` (fondo blanco, azules, colores de estado y de los siete Tipos_de_Evento), `shared/lib/messages.ts` con todos los textos, `colors.ts` y `contrastRatio`.
    - Verificación: todos los pares texto/fondo declarados tienen contraste ≥ 4.5:1; no hay textos en inglés en la interfaz.
    - _Requirements: 15.1, 15.2, 15.7, 15.14, 15.16_

  - [x]* 5.2 Escribir prueba de propiedades del contraste de la paleta
    - **Property 44: Contraste de la paleta**
    - **Validates: Requirements 15.14**

  - [x] 5.3 Implementar `apiClient`, `ApiError` y `useApi`
    - Objetivo: `fetch` con `credentials: 'include'`, errores tipados `ApiError{ status, code, message, errors }`, tiempo máximo configurable (10 s en dashboard), 401 que limpia el usuario y lleva a `/login`, y detección de `AUTORIZACION_ADMIN_REQUERIDA` para abrir el diálogo y repetir la solicitud original.
    - Verificación: una respuesta 400 con `errors[]` produce un `ApiError` con los campos; un 401 redirige a `/login`.
    - _Requirements: 13.5, 15.12, 4.6, 18.9_

  - [x] 5.4 Implementar `sortRows`, `useSort` y `usePagination`
    - Objetivo: ordenamiento ascendente y descendente por cualquier columna y estado de paginación para las tablas.
    - Verificación: alternar la dirección invierte el orden salvo empates.
    - _Requirements: 15.5_

  - [x]* 5.5 Escribir prueba de propiedades de ordenamiento
    - **Property 43: Ordenamiento de tablas**
    - **Validates: Requirements 15.5**

  - [x] 5.6 Crear los componentes compartidos
    - Objetivo: `DataTable`, `SearchBox`, `FormField`, `Modal`, `ConfirmDialog` ("Confirmar"/"Cancelar"), `StatusBadge` (color y texto), `StatCard` con ícono, `ProgressBar` con valor en texto, `Tabs`, `Spinner`, botón con estado de carga, `Toast`/`ErrorBanner` y `Avatar`, con transiciones de 150 a 250 ms.
    - Verificación: el botón de envío queda deshabilitado mientras carga; `ConfirmDialog` solo ejecuta la acción con "Confirmar"; las tablas usan `overflow-x-auto`.
    - _Requirements: 15.5, 15.6, 15.7, 15.9, 15.10, 15.11, 15.12, 15.13, 15.15, 15.16, 4.10_

  - [x] 5.7 Implementar autenticación, navegación y rutas del frontend
    - Objetivo: `AuthContext`/`useAuth` (usa `/auth/me`), `navigation.ts` con roles por ítem derivados de la matriz, `ProtectedRoute`, `RoleGuard` (redirige en menos de 1 s con aviso "Acceso denegado"), `router.tsx` con el mapa de rutas del diseño y página de inicio por rol (ADMIN `/dashboard`; DOCTOR y NURSE `/pacientes`; CLEANING `/inventario-limpieza`).
    - Verificación: un DOCTOR que abre `/auditoria` es redirigido a `/pacientes` con el aviso; el menú de cada rol contiene solo sus módulos.
    - _Requirements: 2.8, 2.9, 15.3_

  - [x]* 5.8 Escribir prueba de propiedades del menú por rol
    - **Property 4: Matriz de permisos por rol (menú del frontend)**
    - **Validates: Requirements 2.8, 2.3, 2.4, 2.5, 2.6**

  - [x] 5.9 Crear `Layout`, `Sidebar` y `Topbar` responsivos
    - Objetivo: menú fijo de 256 px desde 768 px (compacto en tableta); por debajo, panel desplegable con botón de menú; `Topbar` con nombre, rol, foto y "Cerrar sesión"; íconos médicos de `lucide-react` en cada entrada.
    - Verificación: a 320, 768 y 1280 px no hay desplazamiento horizontal de la página; bajo 768 px el menú está oculto por defecto.
    - _Requirements: 15.3, 15.4, 15.6, 15.9, 15.10_

  - [x] 5.10 Crear las páginas de acceso y recuperación
    - Objetivo: `LoginPage` (foto ilustrativa local en `public/avatars` y enlace "¿Olvidaste tu contraseña?"), `ForgotPasswordPage`, `ResetPasswordPage` (lee `token` de la URL) y `ChangePasswordPage`, con zod y redirección a `/cambiar-contrasena` cuando `mustChangePassword` es verdadero.
    - Verificación: credenciales incorrectas muestran el mensaje genérico sin borrar el formulario; la solicitud de recuperación muestra el mismo mensaje exista o no el correo; una cuenta nueva no puede navegar a otro módulo antes de cambiar la contraseña.
    - _Requirements: 1.1, 1.2, 1.9, 5.12, 15.8, 15.11, 15.12, 17.1, 17.5, 17.7, 17.10_

  - [x] 5.11 Implementar validación de formularios y mapeo de errores de API
    - Objetivo: `shared/lib/validation.ts` que valida con zod al enviar (errores por campo en menos de 500 ms, rechaza solo espacios, no envía si hay errores, conserva valores) y asigna `errors[]` de 400 y el 409 al campo `internalId`.
    - Verificación: un formulario con campo vacío no dispara ninguna solicitud; un 409 muestra el mensaje junto al ID interno.
    - _Requirements: 3.1, 3.2, 3.5, 3.8_

  - [x] 5.12 Implementar `AdminAuthDialog` y `useAdminAuth`
    - Objetivo: diálogo en español que solicita la contraseña del Administrador, llama a `POST /admin-authorization`, muestra el vencimiento y, tras el éxito, repite la solicitud original; maneja 401 y 429.
    - Verificación: ante `AUTORIZACION_ADMIN_REQUERIDA` se abre el diálogo y la solicitud se repite una sola vez tras autorizar.
    - _Requirements: 18.1, 18.9, 15.12_

  - [x] 5.13 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Módulos funcionales
  - [x] 6.1 Backend de Personal y Departamentos
    - Objetivo: rutas, controlador, servicio, repositorio y esquemas de `/staff` (lista con filtros AND y búsqueda, alta con contraseña inicial aleatoria única de 12 caracteres devuelta una sola vez y `mustChangePassword=true`, detalle propio o ADMIN con auditoría de la consulta de otro Perfil, edición con auditoría de `ROLE_CHANGE`, `PATCH /staff/me` limitado a foto y teléfono con 403 para otras claves, baja con 409 si hay Pacientes activos o es la propia cuenta) y `GET /departments`; montar en `routes/index.ts`.
    - Verificación: ID interno duplicado devuelve 409; un Empleado que pide otro Perfil recibe 403; `PATCH /staff/me` con `departmentId` devuelve 403 sin cambios.
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.17, 12.1, 12.2, 13.1, 13.2, 2.10_

  - [x]* 6.2 Escribir prueba de propiedades de contraseñas iniciales
    - **Property 8: Contraseñas iniciales únicas**
    - **Validates: Requirements 5.12, 14.5**

  - [x] 6.3 Backend de horarios y fotos de Perfil
    - Objetivo: `PUT /staff/:id/schedule` (ADMIN o el propio Empleado, validado con `validateDaySchedule`, 400 conserva el horario anterior) y `POST /staff/:id/photo` (multipart con `multer`, `validateUpload`, foto anterior intacta si falla, imagen ilustrativa por defecto), con archivos en `uploads/photos`.
    - Verificación: una foto de 3 MB o con firma distinta devuelve 400 y conserva la anterior; un Descanso solapado devuelve 400 con el campo indicado.
    - _Requirements: 5.7, 5.13, 5.14, 5.15, 5.16_

  - [x] 6.4 Backend de Documentos_de_Empleado y Apartado_Privado
    - Objetivo: `/me/documents` y `/me/documents/:docId/file` (solo propios, lectura y descarga, 403 si es ajeno) y `/staff/:id/documents`, `/documents/:docId` y `/documents/:docId/file` (ADMIN con `requireAdminAuthorization`, carga PDF ≤ 5 MB, reemplazo y borrado de fila y archivo) con almacenamiento en `storage/documents`, entrega solo por ruta autenticada con `application/pdf`, auditoría antes de entregar (500 sin datos si falla) e indicador `expired`; al eliminar un Empleado se borran sus documentos y archivos.
    - Verificación: sin autorización administrativa se obtiene 403 `AUTORIZACION_ADMIN_REQUERIDA` sin datos; un Empleado no puede cargar ni ver documentos ajenos; un PDF falso o de 6 MB devuelve 400.
    - _Requirements: 19.1, 19.2, 19.3, 19.4, 19.5, 19.6, 19.7, 19.8, 12.9, 18.5, 5.10_

  - [x] 6.5 Frontend de Personal, Perfil y horario
    - Objetivo: módulo `staff` (`/personal`, `/personal/nuevo`, `/personal/:id`) con tabla ordenable, búsqueda y filtros (rol, Departamento, Turno), formulario, confirmación de borrado y muestra única de la contraseña inicial; `/perfil` con foto circular, nombre, cargo, Departamento, Turno y descripción (una columna bajo 768 px), edición de foto, teléfono, contraseña y editor del Horario_de_Trabajo con comida y Descansos.
    - Verificación: el ADMIN crea, edita y elimina Empleados con datos reales de la API; un Médico solo ve `/perfil` y no puede editar campos restringidos.
    - _Requirements: 5.3, 5.4, 5.6, 5.7, 5.12, 5.13, 5.15, 13.5, 15.5, 15.8, 15.13, 15.15, 15.17_

  - [x] 6.6 Frontend de documentos y Apartado_Privado
    - Objetivo: en `/personal/:id` la pestaña de documentos (lista, carga, reemplazo, descarga y borrado, con `AdminAuthDialog` ante `AUTORIZACION_ADMIN_REQUERIDA`) y `/perfil/documentos` con lista de solo lectura, tipo, fechas e insignia "Vencido".
    - Verificación: tras ingresar la contraseña del Administrador se repite la solicitud y se muestran los documentos; al vencer los 10 minutos se vuelve a solicitar.
    - _Requirements: 18.9, 19.2, 19.4, 19.9, 15.7_

  - [ ] 6.7 Backend de Pacientes, historial y observaciones
    - Objetivo: `/patients` (lista con alcance por responsable, filtros, búsqueda, orden por ingreso descendente y paginación), `GET /patients/counts`, alta con movimiento `ingreso` en la misma transacción, edición, `PATCH /patients/:id/status` (alta o fallecimiento con `deceasedAt` válido, cierra la Asignación activa con su motivo, agrega movimiento y audita; 409 desde `fallecido`), `POST /patients/:id/readmission`, `PATCH` de Observación_Médica y de Observación_de_Enfermería con `canUpdatePatientField` (403 o 409 según el caso), `GET /patients/:id/movements` y 405 para PUT, PATCH y DELETE de movimientos.
    - Verificación: un Médico solo lista sus Pacientes; CLEANING recibe 403; una observación sobre un Paciente `dado de alta` devuelve 409; un reingreso de un `fallecido` devuelve 409; fecha de ingreso futura devuelve 400.
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.12, 6.13, 6.14, 13.6, 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9, 21.1, 21.2, 21.5, 21.6, 21.7, 12.2_

  - [ ] 6.8 Backend de Tratamientos y cirugías
    - Objetivo: `/patients/:id/treatments` (lista con filtros por tipo y estado, más reciente primero), creación y edición por ADMIN o Médico responsable (tipo `tratamiento` o `cirugía`, descripción 1 a 500, máximo 100 por Paciente) y `PATCH .../status` (`programado` a `realizado` con `performedAt` por Médico o Enfermero responsable; cancelar solo ADMIN o Médico); tipo o estado inválido devuelve 400.
    - Verificación: un Enfermero solo puede marcar `realizado`; el Tratamiento 101 de un Paciente se rechaza; un Paciente no activo devuelve 409 para M y E.
    - _Requirements: 6.11, 20.10, 20.11, 21.3, 21.4, 21.5, 21.6, 21.7_

  - [ ] 6.9 Frontend de Pacientes
    - Objetivo: módulo `patients` con pestañas "Activos", "Dados de alta" y "Fallecidos" con contadores, tabla con búsqueda y paginación, formulario, detalle con Historial_del_Paciente, Tratamientos_Programados filtrables por tipo y estado, reingreso y cambio de estado; los controles de edición se muestran solo si el Rol puede ejecutarlos.
    - Verificación: el ADMIN gestiona Pacientes y tratamientos; un Médico solo edita la Observación_Médica y tratamientos de sus Pacientes activos; el menú de CLEANING no muestra Pacientes.
    - _Requirements: 6.5, 6.11, 15.7, 20.9, 20.10, 21.8, 13.5_

  - [ ] 6.10 Backend de Habitaciones, asignaciones, liberaciones e historial de ocupación
    - Objetivo: `/rooms` con `availability` calculada y Pacientes activos, CRUD con número único 1 a 9999 y capacidad 1 a 10, `GET /rooms/counters`, `POST /rooms/:id/assignments`, `POST /rooms/:id/releases` con `reason` `alta` o `fallecimiento` en transacción (cierra la Asignación, cambia el estado del Paciente, agrega movimiento y audita; 409 y 400 según reglas), `GET /occupancy-history` y `GET /occupancy-history/summary`.
    - Verificación: asignar a una habitación llena, a un Paciente ya asignado o no activo devuelve 409 sin cambios; un motivo inválido devuelve 400; los contadores suman el total de habitaciones.
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 9.10, 9.11, 9.12, 9.13, 27.1, 27.3, 27.4, 27.5, 27.6, 12.2_

  - [ ] 6.11 Frontend de Habitaciones
    - Objetivo: módulo `rooms` con contadores actualizados sin recargar la página, tarjetas por Departamento, filtros, diálogos de asignar y liberar (con selección de motivo) y pestaña "Historial" con filtro por Departamento y resumen.
    - Verificación: tras asignar hasta la capacidad la habitación se muestra `ocupada`; el 409 se muestra en español sin cerrar el diálogo; los contadores cambian en menos de 2 s.
    - _Requirements: 9.3, 9.4, 9.5, 9.10, 27.2, 27.7, 15.7, 15.12_

  - [ ] 6.12 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

  - [ ] 6.13 Backend de Inventario médico clasificado y movimientos
    - Objetivo: `/inventory/products` (solo `insumo médico` y `medicamento`, filtros del Req. 7 y 22.6, paginación, `lowStock` y `availability` derivados, validación de Subcategoría_de_Insumo y de datos de medicamento, `categoría material de limpieza` devuelve 400), `POST` y `GET /inventory/products/:id/movements`, `GET /inventory/movements` (filtros, orden descendente, ambos inventarios) y 405 para PUT, PATCH y DELETE de movimientos; todo cambio de cantidad registra el Movimiento_de_Inventario en la misma transacción (500 y reversión si falla) y audita `INVENTORY_MOVEMENT`.
    - Verificación: una salida mayor a la existente devuelve 409; un motivo vacío o de más de 200 caracteres devuelve 400; un Médico o Enfermero recibe 403; una clasificación de control incoherente con la receta devuelve 400.
    - _Requirements: 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.11, 7.13, 22.1, 22.2, 22.3, 22.4, 22.5, 22.6, 23.3, 25.1, 25.2, 25.3, 25.4, 25.5, 25.6, 25.7, 25.8, 25.9, 13.6_

  - [ ] 6.14 Backend de Inventario de limpieza independiente
    - Objetivo: `/cleaning-inventory/products` con su propio router, controlador y servicio (solo `material de limpieza`, otra categoría devuelve 400), lectura para ADMIN y CLEANING, escritura solo ADMIN (403 para CLEANING), movimientos en `POST /cleaning-inventory/products/:id/movements` con las mismas reglas de Stock_Bajo, disponibilidad y Movimiento_de_Inventario.
    - Verificación: CLEANING solo lee y recibe 403 al modificar o consultar `/inventory`; Médico y Enfermero reciben 403 en ambos inventarios; el filtro de categoría ajena no altera el alcance.
    - _Requirements: 7.10, 7.11, 23.1, 23.2, 23.3, 23.4, 23.5, 25.1_

  - [ ] 6.15 Backend de Proveedores y Entregas
    - Objetivo: `/suppliers` (CRUD con detalle de Productos suministrados e historial de entregas), `/deliveries` (filtros, orden por fecha programada descendente, paginación), creación y edición solo en `programada` con Proveedor igual al del Producto, `POST /deliveries/:id/receive` en una transacción (estado `recibida`, Movimiento `entrada`, suma de cantidad, auditoría `DELIVERY_RECEIVE`; 409 si excede 999 999) y `POST /deliveries/:id/cancel` (audita `DELIVERY_CANCEL`, sin tocar la cantidad); 403 para no ADMIN.
    - Verificación: recibir una entrega ya `recibida` o `cancelada` devuelve 409; un fallo del Movimiento revierte la cantidad; un Proveedor distinto al del Producto devuelve 400.
    - _Requirements: 7.12, 7.13, 24.1, 24.2, 24.3, 24.4, 24.5, 24.6, 24.7, 24.8, 24.9, 12.2, 13.6_

  - [ ] 6.16 Frontend de Inventario médico
    - Objetivo: módulo `inventory` en `/inventario` con tabla (búsqueda, filtros de categoría, subcategoría, disponibilidad, Stock_Bajo, Proveedor, tipo de medicamento, clasificación de control, receta y controlado), formulario con campos de medicamento condicionales, insignia "Controlado", insignias de "Stock bajo" y "agotado", aviso de datos ficticios y detalle con movimientos y registro de entrada, salida o ajuste con motivo.
    - Verificación: un Producto con cantidad ≤ mínimo muestra "Stock bajo"; el campo nombre comercial aparece solo para medicamentos "de patente".
    - _Requirements: 7.3, 7.4, 7.5, 22.6, 22.7, 25.8, 15.7, 15.15, 13.5_

  - [ ] 6.17 Frontend de Inventario de limpieza
    - Objetivo: módulo `cleaning` en `/inventario-limpieza` (entrada de menú y pantalla propias) con tabla, filtros y búsqueda, gestión completa para ADMIN y vista de solo lectura sin acciones de edición para CLEANING.
    - Verificación: CLEANING aterriza en esta pantalla, no ve botones de edición y no ve el menú del inventario médico.
    - _Requirements: 23.1, 23.2, 23.4, 23.5, 2.6, 15.3_

  - [ ] 6.18 Frontend de Proveedores y Entregas
    - Objetivo: módulo `suppliers` en `/proveedores` con CRUD de Proveedores, detalle con Productos y entregas (cantidades solicitada y recibida), lista de entregas con filtros y paginación y diálogos de programar, recibir (fecha y cantidad) y cancelar con confirmación.
    - Verificación: tras recibir una entrega su estado pasa a "recibida" y la cantidad del Producto aumenta; una entrega recibida no ofrece acciones.
    - _Requirements: 24.1, 24.3, 24.6, 24.7, 24.8, 15.13, 15.7_

  - [ ] 6.19 Backend de Equipos médicos y mantenimiento
    - Objetivo: `/equipment` (filtros AND, cantidad 1 a 9999, 404 si no existe), `GET /equipment/summary`, `PATCH /equipment/:id/status` (audita `EQUIPMENT_STATUS_CHANGE`), `/maintenance` (filtros, paginación), `POST /maintenance` (deja el Equipo `en mantenimiento`; 409 si ya hay uno en curso; audita `MAINTENANCE_OPEN`), `POST /maintenance/:id/close` (fecha de fin ≥ inicio, estado resultante `disponible` o `fuera de servicio`; audita `MAINTENANCE_CLOSE`) y `GET /equipment/:id/maintenance`.
    - Verificación: cantidad 0 o 10000 devuelve 400; un segundo mantenimiento en curso devuelve 409; un no ADMIN recibe 403.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.9, 8.10, 26.1, 26.2, 26.3, 26.4, 26.5, 26.6, 26.7, 26.8, 26.9, 12.2_

  - [ ] 6.20 Frontend de Equipos y mantenimiento
    - Objetivo: módulo `equipment` en `/equipos` con equipos agrupados por Departamento y conteo, filtros, formulario, cambio de estado con insignia, pestañas "Mantenimiento" (registrar y cerrar) y "Resumen" (tabla por categoría y Departamento con totales) y detalle con historial de mantenimiento.
    - Verificación: el cambio a "en mantenimiento" se refleja en la tabla y en el dashboard; los totales del resumen coinciden con las cantidades.
    - _Requirements: 8.3, 8.6, 8.7, 8.8, 8.11, 26.6, 26.7, 26.8, 15.7_

  - [ ] 6.21 Backend de Calendarios, Eventos, Días_Inhábiles y Feriados
    - Objetivo: `/calendars/general`, `/calendars/activities`, `/calendars/birthdays`, `/calendars/shifts` y `/calendars/agenda` (horario, Eventos personales y Tratamientos `programado` de Pacientes asignados), CRUD `/events` por ADMIN, `/events/personal` solo por su propietario (403 incluso para ADMIN), `/non-working-days` (lectura para todos, escritura ADMIN, fecha duplicada devuelve 409) y `GET /holidays?year=` con el servicio de caché; las entregas se generan como Eventos virtuales y las canceladas se excluyen.
    - Verificación: fin anterior al inicio devuelve 400; un Empleado solo ve su Turno; ADMIN consulta cualquier agenda; año 1899 devuelve 400; sin Nager.Date el calendario responde con `available: false`.
    - _Requirements: 10.1, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10, 11.1, 11.3, 11.5, 11.6, 28.1, 28.2, 28.3, 28.4, 28.5, 28.6, 28.7, 28.9, 6.11_

  - [ ] 6.22 Frontend de Calendarios
    - Objetivo: módulo `calendars` en `/calendarios` con `CalendarView` en vistas mes y semana, pestañas General, Actividades y entregas, Cumpleaños, Turnos y Mi agenda, leyenda de colores, selector de Empleado para ADMIN, gestión de Eventos y Días_Inhábiles, edición de Eventos personales, visualización de entregas (Proveedor, Producto y cantidad) y aviso en español cuando los feriados no están disponibles.
    - Verificación: cada tipo de evento aparece con su color y leyenda; sin Nager.Date el calendario sigue operando con el aviso visible; un Empleado no ve los turnos de otros.
    - _Requirements: 10.1, 10.2, 10.6, 10.10, 10.11, 11.2, 11.4, 28.2, 28.8_

  - [ ] 6.23 Backend del Dashboard
    - Objetivo: `GET /dashboard` solo ADMIN con `computeDashboardStats` calculado en cada solicitud (seis estadísticas, indicadores adicionales y ocupación por Departamento) y lista `upcoming` (entregas `programada` y actividades de los próximos 7 días).
    - Verificación: otros roles reciben 403 sin estadísticas; cambiar un dato y volver a consultar refleja el nuevo valor.
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.7, 4.9, 8.8, 23.6_

  - [ ] 6.24 Backend de Auditoría
    - Objetivo: `GET /audit` con filtros de usuario, acción y fechas inclusivas, paginación y orden descendente; POST, PUT, PATCH y DELETE responden 405; solo ADMIN.
    - Verificación: un filtro sin coincidencias devuelve lista vacía; PUT y DELETE devuelven 405; un no ADMIN recibe 403.
    - _Requirements: 12.3, 12.4, 12.5, 12.7, 13.6_

  - [ ] 6.25 Frontend de Dashboard y Auditoría
    - Objetivo: `dashboard` con seis `StatCard` con ícono (una columna bajo 768 px, dos en tableta, tres en escritorio), indicadores adicionales, barras de ocupación por Departamento con valor numérico, lista de próximos 7 días o mensaje de vacío, error sin valores parciales y límite de 10 s; `audit` con tabla paginada, filtros y mensaje "No hay resultados".
    - Verificación: si la API falla no se muestra ningún valor en las tarjetas; los filtros de auditoría combinan todos los criterios.
    - _Requirements: 4.1, 4.2, 4.3, 4.6, 4.8, 4.9, 4.10, 12.3, 12.4, 15.6_

  - [ ] 6.26 Checkpoint - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Integración y pruebas
  - [ ] 7.1 Revisar el cableado final y completar la semilla
    - Objetivo: confirmar que `routes/index.ts` monta todos los recursos con sus middlewares (`authenticate`, `requirePasswordChange`, `authorize`, `validate`, `methodNotAllowed` en auditoría y movimientos) y que la semilla alimenta los módulos de las etapas 3 a 6 sin conexión a internet.
    - Verificación: tras migrar y sembrar, el ADMIN ve datos en todos los módulos y cada rol demo entra a su página de inicio; la semilla sigue idempotente.
    - _Requirements: 13.1, 14.1, 14.4, 14.6, 14.10, 16.9, 16.10_

  - [ ]* 7.2 Escribir pruebas de propiedades de validación de esquemas
    - **Property 5: Validación de esquemas con errores por campo**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 5.2, 6.3, 6.4, 6.14, 7.2, 7.8, 8.2, 8.4, 8.9, 9.2, 9.13, 20.11, 22.1, 22.2, 22.3, 22.4, 22.5, 23.3, 24.1, 26.1**

  - [ ]* 7.3 Escribir pruebas de integración de auditoría
    - Objetivo: una prueba por cada operación sensible del Req. 12.2 con su entrada de auditoría, fallo forzado que revierte y responde 500, fallo de auditoría en documentos sin entrega de datos y 405 en auditoría, movimientos de Paciente y de inventario.
    - _Requirements: 12.1, 12.2, 12.7, 12.8, 12.9, 19.7, 20.8, 25.6, 25.7_

  - [ ]* 7.4 Escribir pruebas de integración de permisos y alcance
    - Objetivo: matriz de roles contra cada recurso (401, 403 sin datos), alcance de Pacientes, inventarios y agendas, permisos de actualización de Médicos y Enfermeros, `PATCH /staff/me`, documentos propios y ajenos, CORS y límites de intentos.
    - _Requirements: 2.1, 2.2, 2.7, 5.8, 5.9, 6.6, 6.7, 7.10, 7.11, 8.10, 9.12, 10.8, 13.9, 13.10, 19.5, 21.5, 21.6, 23.5_

  - [ ]* 7.5 Escribir pruebas de integración de reglas de negocio
    - Objetivo: ID duplicado 409 por recurso, no eliminar Empleado con Pacientes activos ni la propia cuenta, cierre de Asignación al cambiar el estado, reingreso de `fallecido` 409, Día_Inhábil duplicado 409, integridad referencial 409 y 404 de equipo inexistente.
    - _Requirements: 3.7, 5.10, 5.11, 6.13, 20.5, 28.4, 8.5, 14.7_

  - [ ]* 7.6 Escribir pruebas de integración transaccionales
    - Objetivo: recepción de entrega (estado, Movimiento, cantidad y auditoría en una transacción), reversión ante fallo del Movimiento, liberación de habitación con motivo (Asignación, estado del Paciente y movimiento) y rollback de la semilla.
    - _Requirements: 24.3, 25.7, 9.4, 14.9_

  - [ ]* 7.7 Escribir pruebas de integración de feriados
    - Objetivo: respuestas simuladas de Nager.Date (éxito, error y tiempo agotado), caché de 24 h y calendario operativo con `available: false`.
    - _Requirements: 11.1, 11.3, 11.4, 11.5_

  - [ ]* 7.8 Escribir pruebas de componentes del frontend
    - Objetivo: redirección con aviso por ruta no permitida, menú colapsable bajo 768 px, diálogo de confirmación antes de eliminar, errores por campo conservando valores, `AdminAuthDialog` con reintento, pestañas de Pacientes con contadores, insignias "Controlado" y "Vencido", barras de ocupación con texto y mensaje de dashboard vacío o con error.
    - _Requirements: 2.9, 15.4, 15.13, 3.2, 3.5, 4.3, 4.6, 4.10, 18.9, 19.9, 20.9, 22.7_

  - [ ]* 7.9 Escribir pruebas de humo del proyecto
    - Objetivo: verificar `strict` y ausencia de `any` explícito, que ninguna ruta ni controlador importe Prisma, que no exista `$queryRawUnsafe`, que existan los `.env.example` con las variables SMTP opcionales, que los PDF no se sirvan como estáticos y que el sistema inicie sin internet.
    - _Requirements: 16.2, 16.4, 16.5, 16.7, 16.9, 3.6, 19.6_

  - [ ] 7.10 Completar el README en español
    - Objetivo: documentar instalación, migración, semilla (con el origen de las contraseñas demo), ejecución de ambos proyectos, variables de entorno (incluidas las SMTP opcionales), cómo consultar la Bandeja_Local, ejecución de pruebas, límites de intentos en memoria y la lista de cuentas demo con su rol.
    - Verificación: siguiendo solo el README en un entorno limpio, el sistema inicia y se puede entrar con una cuenta demo de cada rol y recuperar una contraseña leyendo la Bandeja_Local.
    - _Requirements: 16.8, 14.5, 16.9, 17.4_

  - [ ] 7.11 Checkpoint final - Ensure all tests pass
    - Ensure all tests pass, ask the user if questions arise.

## Notes

- Las tareas marcadas con `*` son opcionales (pruebas) y pueden omitirse para un MVP más rápido.
- Cada tarea referencia requisitos concretos para trazabilidad; las pruebas de propiedades usan `fast-check` con al menos 100 iteraciones y la etiqueta `Feature: hospital-management-system, Property N`, con la numeración del diseño actual (1 a 44).
- Las pruebas de propiedades cubren solo la lógica pura; el CRUD, la interfaz, el correo y la integración con Nager.Date se cubren con pruebas de ejemplo e integración.
- Ninguna contraseña demo se escribe en el código ni en la semilla; se leen del entorno o se generan y se imprimen una sola vez.
- Los checkpoints dividen las etapas para validar de forma incremental.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3"] },
    { "id": 2, "tasks": ["1.4"] },
    { "id": 3, "tasks": ["1.5", "2.1"] },
    { "id": 4, "tasks": ["2.2"] },
    { "id": 5, "tasks": ["2.3"] },
    { "id": 6, "tasks": ["2.4"] },
    { "id": 7, "tasks": ["2.5"] },
    { "id": 8, "tasks": ["3.1"] },
    { "id": 9, "tasks": ["3.2", "3.3", "3.5", "3.8", "3.12", "3.15", "3.18", "3.21", "3.24", "3.32"] },
    { "id": 10, "tasks": ["3.4", "3.6", "3.7", "3.9", "3.10", "3.11", "3.13", "3.14", "3.16", "3.17", "3.19", "3.20", "3.22", "3.23", "3.25", "3.26", "3.27", "3.28", "3.29", "3.30", "3.31", "3.33", "3.34", "3.35"] },
    { "id": 11, "tasks": ["3.36"] },
    { "id": 12, "tasks": ["3.37"] },
    { "id": 13, "tasks": ["4.1", "4.4", "4.6", "4.14", "4.17"] },
    { "id": 14, "tasks": ["4.2", "4.3", "4.5", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.15", "4.16", "4.18", "4.19", "4.21"] },
    { "id": 15, "tasks": ["4.20", "4.22"] },
    { "id": 16, "tasks": ["4.23"] },
    { "id": 17, "tasks": ["4.24"] },
    { "id": 18, "tasks": ["4.25"] },
    { "id": 19, "tasks": ["4.26"] },
    { "id": 20, "tasks": ["5.1", "5.3", "5.4"] },
    { "id": 21, "tasks": ["5.2", "5.5", "5.6"] },
    { "id": 22, "tasks": ["5.7", "5.11", "5.12"] },
    { "id": 23, "tasks": ["5.8", "5.9"] },
    { "id": 24, "tasks": ["5.10"] },
    { "id": 25, "tasks": ["5.13"] },
    { "id": 26, "tasks": ["6.1"] },
    { "id": 27, "tasks": ["6.2", "6.3"] },
    { "id": 28, "tasks": ["6.4", "6.5"] },
    { "id": 29, "tasks": ["6.6", "6.7"] },
    { "id": 30, "tasks": ["6.8"] },
    { "id": 31, "tasks": ["6.9", "6.10"] },
    { "id": 32, "tasks": ["6.11"] },
    { "id": 33, "tasks": ["6.12"] },
    { "id": 34, "tasks": ["6.13"] },
    { "id": 35, "tasks": ["6.14", "6.15"] },
    { "id": 36, "tasks": ["6.16", "6.17", "6.18", "6.19"] },
    { "id": 37, "tasks": ["6.20", "6.21"] },
    { "id": 38, "tasks": ["6.22", "6.23", "6.24"] },
    { "id": 39, "tasks": ["6.25"] },
    { "id": 40, "tasks": ["6.26"] },
    { "id": 41, "tasks": ["7.1"] },
    { "id": 42, "tasks": ["7.2", "7.3", "7.4", "7.5", "7.6", "7.7", "7.8", "7.9", "7.10"] },
    { "id": 43, "tasks": ["7.11"] }
  ]
}
```
