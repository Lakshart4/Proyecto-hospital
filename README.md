# Sistema de Gestión y Administración Hospitalaria

Prototipo académico (curso "Portales Web") de una aplicación web Full Stack para un hospital ficticio. Todos los datos son ficticios y de demostración.

Estructura: dos proyectos independientes, `frontend/` (React + TypeScript + Vite + Tailwind CSS) y `backend/` (Node.js + Express + TypeScript + SQLite con Prisma).

## Instalación

_Instrucciones completas pendientes (tarea 7.10)._

Backend (en Windows con PowerShell, usa `npm.cmd` y `npx.cmd`):

```powershell
cd backend
npm.cmd install
npm.cmd run generate
```

`npm run generate` (`prisma generate`) es **obligatorio** después de cada `npm install`. npm 11 bloquea por defecto los scripts de instalación de las dependencias, entre ellos el que genera el cliente de Prisma. Sin este paso, el Backend y `tsc` fallan porque faltan los tipos de Prisma.

## Migración

Copia `backend/.env.example` como `backend/.env` y completa `SESSION_SECRET` (mínimo 32 caracteres aleatorios). Después crea la base SQLite y aplica las migraciones:

```powershell
cd backend
npm.cmd run migrate
```

`npm run migrate` (`prisma migrate dev`) crea `backend/prisma/dev.db` y también regenera el cliente de Prisma.

## Semilla

La semilla carga datos demo ficticios: 6 Departamentos, 11 cuentas (1 Administrador y 10 Empleados) con sus horarios y documentos PDF ficticios, 12 Pacientes, 20 Habitaciones, 4 Proveedores, 20 Productos, 8 entregas, 24 movimientos de inventario, 12 equipos, 6 mantenimientos, 6 eventos y 3 días inhábiles. Todos los nombres y correos (`@example.com`) son inventados.

1. Prepara `backend/.env` a partir de `backend/.env.example` (ver [Migración](#migración)). La semilla usa la misma validación que el Backend, así que exige `SESSION_SECRET`, `DATABASE_URL` y `CORS_ORIGIN`.
2. Opcional: define las contraseñas demo en `backend/.env`, una variable por cuenta (`DEMO_ADMIN_PASSWORD`, `DEMO_DOCTOR_1_PASSWORD` ... `DEMO_CLEANING_3_PASSWORD`). Cada una debe tener de 8 a 128 caracteres y ser distinta de las demás.
3. Aplica las migraciones y ejecuta la semilla:

```powershell
cd backend
npm.cmd run migrate
npm.cmd run seed
```

Al terminar bien, la consola muestra los conteos y una tabla **CREDENCIALES DEMO** con el correo, el rol y la contraseña de cada cuenta:

- Si la variable de la cuenta está vacía y la cuenta es nueva, la contraseña se genera al azar y **se muestra solo esa vez**. Guárdala.
- Si la variable está vacía y la cuenta ya existe, se conserva su contraseña y la tabla indica "se conserva la contraseña existente".
- Si la variable está definida, la cuenta toma esa contraseña.

Para fijar o recuperar la contraseña de una cuenta demo, define su variable en `backend/.env` y vuelve a ejecutar `npm run seed`.

**Volver a ejecutar la semilla** no duplica datos ni modifica los existentes (salvo las contraseñas indicadas por variable). Las fechas demo se calculan desde la primera ejecución y no cambian al repetirla. Para empezar de cero, borra `backend/prisma/dev.db` y vuelve a ejecutar `npm run migrate` y `npm run seed`.

Limitación: la idempotencia supone que no se han cambiado las claves de los datos demo (por ejemplo, el correo de una cuenta, el ID interno de un Paciente o el número de una Habitación). Si una cuenta demo existe con otro rol o ID interno, o un registro con un ID usado por la semilla tiene otros datos, la semilla se detiene sin sobrescribir nada.

Si la semilla falla, no se guarda ningún cambio, se borran los PDF que creó en esa ejecución y la consola muestra la causa. Los PDF ficticios se guardan en `backend/storage/documents/seed/`, una carpeta privada que no se publica ni se sube a git.

## Ejecución

Con las dependencias instaladas, el cliente de Prisma generado y las migraciones aplicadas, abre dos terminales PowerShell:

```powershell
# Terminal 1: API en http://localhost:3000
cd backend
npm.cmd run dev
```

```powershell
# Terminal 2: interfaz en http://localhost:5173
cd frontend
npm.cmd run dev
```

Abre `http://localhost:5173/login`. El proxy de Vite envía `/api` al Backend y conserva la cookie de sesión. Para una instalación nueva, ejecuta antes `npm.cmd install`, `npm.cmd run generate`, `npm.cmd run migrate` y, si se necesitan los datos ficticios iniciales, `npm.cmd run seed` en `backend`.

La navegación visible se concentra en módulos demostrables y conectados a la API: autenticación, dashboard, reportes, personal, pacientes, citas médicas, inventario, habitaciones, perfil y documentos propios. Los demás modelos y módulos permanecen en el código para continuar su desarrollo, pero no se muestran como enlaces incompletos.

## Bandeja_Local

Si no defines las cinco variables `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` y `SMTP_FROM` y el entorno no es de producción, el Backend no envía correos: los escribe en su propia consola (la **Bandeja_Local**) con el destinatario, el asunto y el texto.

Para restablecer una contraseña en desarrollo:

1. Solicita la recuperación desde la página "¿Olvidaste tu contraseña?" del Frontend.
2. En la terminal donde corre el Backend busca el bloque que empieza con `[Bandeja_Local]`.
3. Abre el enlace `.../restablecer?token=...` que aparece en el texto. Vence a los 30 minutos y solo sirve una vez.

El enlace solo aparece en la Bandeja_Local; nunca se guarda en la base de datos ni en la Bitácora_de_Auditoría. En producción sin SMTP no se envía ningún correo y el Backend muestra una advertencia al iniciar.

## Cuentas demo

Credenciales solo para el entorno de demostración. Las contraseñas no están en el código: se toman de las variables `DEMO_*_PASSWORD` o se generan al ejecutar la semilla (ver [Semilla](#semilla)). Ninguna cuenta demo exige cambiar la contraseña al entrar.

| ID interno | Correo | Rol | Departamento | Turno | Variable de contraseña |
|---|---|---|---|---|---|
| ADM-001 | director@example.com | Administrador (Director) | Medicina Interna | matutino | `DEMO_ADMIN_PASSWORD` |
| EMP-001 | medico1@example.com | Médico | Urgencias | matutino | `DEMO_DOCTOR_1_PASSWORD` |
| EMP-002 | medico2@example.com | Médico | Cardiología | vespertino | `DEMO_DOCTOR_2_PASSWORD` |
| EMP-003 | medico3@example.com | Médico | Pediatría | matutino | `DEMO_DOCTOR_3_PASSWORD` |
| EMP-004 | enfermero1@example.com | Enfermero | Urgencias | matutino | `DEMO_NURSE_1_PASSWORD` |
| EMP-005 | enfermero2@example.com | Enfermero | Cardiología | vespertino | `DEMO_NURSE_2_PASSWORD` |
| EMP-006 | enfermero3@example.com | Enfermero | Cirugía | matutino | `DEMO_NURSE_3_PASSWORD` |
| EMP-007 | enfermero4@example.com | Enfermero | Medicina Interna | vespertino | `DEMO_NURSE_4_PASSWORD` |
| EMP-008 | limpieza1@example.com | Personal de limpieza | Urgencias | matutino | `DEMO_CLEANING_1_PASSWORD` |
| EMP-009 | limpieza2@example.com | Personal de limpieza | Pediatría | vespertino | `DEMO_CLEANING_2_PASSWORD` |
| EMP-010 | limpieza3@example.com | Personal de limpieza | Radiología | vespertino | `DEMO_CLEANING_3_PASSWORD` |
