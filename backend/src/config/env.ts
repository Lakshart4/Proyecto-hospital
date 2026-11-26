// Lectura y validación de las variables de entorno del Backend (Req. 16.5, 16.6, 16.7, 17.11).
//
// `loadEnv` es una función pura: recibe un objeto con las variables y devuelve la
// configuración tipada o lanza `EnvValidationError` con la lista de variables inválidas.
// `loadEnvOrExit` la usa al arrancar: imprime el error y termina el proceso con código 1.
// Los mensajes nunca incluyen el valor de las variables, solo su nombre y el motivo.

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';

export const REQUIRED_ENV_VARS = ['SESSION_SECRET', 'DATABASE_URL', 'CORS_ORIGIN'] as const;
export const SMTP_ENV_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM'] as const;

/** Longitud mínima del secreto de sesión (decisión de implementación, no fijada en los requisitos). */
export const SESSION_SECRET_MIN_LENGTH = 32;
export const DEMO_PASSWORD_MIN_LENGTH = 8;
export const DEMO_PASSWORD_MAX_LENGTH = 128;

const DEFAULT_PORT = 3000;
const DEFAULT_FRONTEND_URL = 'http://localhost:5173';
const DEFAULT_NAGER_COUNTRY = 'MX';
const DEMO_PASSWORD_KEY = /^DEMO_[A-Z0-9_]+_PASSWORD$/;

export type NodeEnv = 'development' | 'test' | 'production';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  from: string;
}

export interface AppConfig {
  nodeEnv: NodeEnv;
  port: number;
  sessionSecret: string;
  databaseUrl: string;
  corsOrigin: string;
  frontendUrl: string;
  nager: { enabled: boolean; country: string };
  /** `null` si falta alguna de las cinco variables SMTP: se usa la Bandeja_Local. */
  smtp: SmtpConfig | null;
  /** Contraseñas demo opcionales para la semilla, por nombre de variable. */
  demoPasswords: Record<string, string>;
}

export interface LoadedEnv {
  config: AppConfig;
  /** Avisos no bloqueantes, por ejemplo una configuración SMTP incompleta. */
  warnings: string[];
}

export interface EnvIssue {
  variable: string;
  message: string;
}

export class EnvValidationError extends Error {
  readonly issues: EnvIssue[];

  constructor(issues: EnvIssue[]) {
    super(formatEnvIssues(issues));
    this.name = 'EnvValidationError';
    this.issues = issues;
  }
}

export function formatEnvIssues(issues: EnvIssue[]): string {
  const lines = issues.map((issue) => `  - ${issue.variable}: ${issue.message}`);
  return ['Configuración inválida del Backend. Revisa estas variables de entorno:', ...lines].join('\n');
}

// ---------- Esquema zod ----------

const MISSING = 'Variable obligatoria no definida.';

/** Trata las cadenas vacías o con solo espacios como variables no definidas. */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const requiredString = () =>
  z.preprocess(
    blankToUndefined,
    z.string({ error: (issue) => (issue.input === undefined ? MISSING : 'Debe ser un texto.') }),
  );

const optionalString = () => z.preprocess(blankToUndefined, z.string().optional());

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isHttpOrigin(value: string): boolean {
  return isHttpUrl(value) && new URL(value).origin === value;
}

const portString = (label: string) =>
  z
    .string()
    .regex(/^\d+$/, `${label} debe ser un número entero.`)
    .refine((v) => Number(v) >= 1 && Number(v) <= 65535, `${label} debe estar entre 1 y 65535.`);

const envSchema = z.object({
  // Sin espacios al principio ni al final, al menos 32 caracteres y no un solo carácter repetido.
  // Los mensajes nunca incluyen el valor.
  SESSION_SECRET: requiredString().pipe(
    z.string().superRefine((value, ctx) => {
      if (value !== value.trim()) {
        ctx.addIssue({ code: 'custom', message: 'No debe tener espacios al principio ni al final.' });
      } else if (value.length < SESSION_SECRET_MIN_LENGTH) {
        ctx.addIssue({ code: 'custom', message: `Debe tener al menos ${SESSION_SECRET_MIN_LENGTH} caracteres.` });
      } else if (new Set(value).size === 1) {
        ctx.addIssue({ code: 'custom', message: 'No puede estar formado por un solo carácter repetido.' });
      }
    }),
  ),
  DATABASE_URL: requiredString().pipe(
    z
      .string()
      .refine(
        (v) => v.startsWith('file:') && v.length > 'file:'.length,
        'Debe ser una URL de SQLite con el formato file:./ruta.db.',
      ),
  ),
  CORS_ORIGIN: requiredString().pipe(
    z
      .string()
      .refine(isHttpOrigin, 'Debe ser un origen http(s) sin ruta ni barra final, por ejemplo http://localhost:5173.'),
  ),
  PORT: z.preprocess(blankToUndefined, portString('El puerto').optional()),
  NODE_ENV: z.preprocess(
    blankToUndefined,
    z
      .enum(['development', 'test', 'production'], {
        error: 'Debe ser development, test o production.',
      })
      .optional(),
  ),
  FRONTEND_URL: z.preprocess(
    blankToUndefined,
    z.string().refine(isHttpUrl, 'Debe ser una URL http(s) válida.').optional(),
  ),
  NAGER_ENABLED: z.preprocess(
    blankToUndefined,
    z.enum(['true', 'false'], { error: 'Debe ser true o false.' }).optional(),
  ),
  NAGER_COUNTRY: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(/^[A-Z]{2}$/, 'Debe ser un código de país de 2 letras mayúsculas, por ejemplo MX.')
      .optional(),
  ),
  SMTP_HOST: optionalString(),
  SMTP_PORT: z.preprocess(blankToUndefined, portString('El puerto SMTP').optional()),
  SMTP_USER: optionalString(),
  SMTP_PASSWORD: optionalString(),
  SMTP_FROM: z.preprocess(
    blankToUndefined,
    z
      .string()
      .regex(
        /^([^<>]*<[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+)$/,
        'Debe ser un correo, por ejemplo "Hospital <no-responder@example.com>".',
      )
      .optional(),
  ),
});

// ---------- Funciones públicas ----------

/**
 * Valida las variables de entorno y devuelve la configuración tipada.
 * @throws EnvValidationError con una entrada por cada variable faltante o inválida.
 */
export function loadEnv(env: Record<string, string | undefined>): LoadedEnv {
  const issues: EnvIssue[] = [];
  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const variable = String(issue.path[0] ?? 'desconocida');
      if (!issues.some((existing) => existing.variable === variable)) {
        issues.push({ variable, message: issue.message });
      }
    }
  }

  const demoPasswords: Record<string, string> = {};
  for (const key of Object.keys(env).sort()) {
    if (!DEMO_PASSWORD_KEY.test(key)) continue;
    const value = env[key];
    if (value === undefined || value.trim() === '') continue;
    if (value.length < DEMO_PASSWORD_MIN_LENGTH || value.length > DEMO_PASSWORD_MAX_LENGTH) {
      issues.push({
        variable: key,
        message: `Debe tener entre ${DEMO_PASSWORD_MIN_LENGTH} y ${DEMO_PASSWORD_MAX_LENGTH} caracteres.`,
      });
      continue;
    }
    demoPasswords[key] = value;
  }

  if (!parsed.success || issues.length > 0) {
    throw new EnvValidationError(issues);
  }

  const data = parsed.data;
  const warnings: string[] = [];

  const smtpValues = SMTP_ENV_VARS.map((name) => data[name]);
  const smtpDefined = smtpValues.filter((value) => value !== undefined).length;
  let smtp: SmtpConfig | null = null;
  if (data.SMTP_HOST && data.SMTP_PORT && data.SMTP_USER && data.SMTP_PASSWORD && data.SMTP_FROM) {
    smtp = {
      host: data.SMTP_HOST,
      port: Number(data.SMTP_PORT),
      user: data.SMTP_USER,
      password: data.SMTP_PASSWORD,
      from: data.SMTP_FROM,
    };
  } else if (smtpDefined > 0) {
    const missing = SMTP_ENV_VARS.filter((name) => data[name] === undefined);
    warnings.push(
      `Configuración SMTP incompleta (faltan: ${missing.join(', ')}). Se usará la Bandeja_Local si el entorno no es de producción.`,
    );
  }

  const config: AppConfig = {
    nodeEnv: data.NODE_ENV ?? 'development',
    port: data.PORT ? Number(data.PORT) : DEFAULT_PORT,
    sessionSecret: data.SESSION_SECRET,
    databaseUrl: data.DATABASE_URL,
    corsOrigin: data.CORS_ORIGIN,
    frontendUrl: (data.FRONTEND_URL ?? DEFAULT_FRONTEND_URL).replace(/\/+$/, ''),
    nager: {
      enabled: (data.NAGER_ENABLED ?? 'true') === 'true',
      country: data.NAGER_COUNTRY ?? DEFAULT_NAGER_COUNTRY,
    },
    smtp,
    demoPasswords,
  };

  return { config, warnings };
}

/**
 * Carga la configuración al iniciar. Si es inválida, escribe el motivo en la consola
 * (sin valores) y termina el proceso con código 1 (Req. 16.6).
 */
export function loadEnvOrExit(
  env: Record<string, string | undefined> = process.env,
  log: (message: string) => void = console.error,
  exit: (code: number) => never = process.exit,
): LoadedEnv {
  try {
    return loadEnv(env);
  } catch (error) {
    if (error instanceof EnvValidationError) {
      log(error.message);
      return exit(1);
    }
    throw error;
  }
}

/** Carga `backend/.env` si existe. Las variables ya definidas en el entorno no se sobrescriben. */
export function loadDotEnvFile(path: string = join(__dirname, '..', '..', '.env')): void {
  if (!existsSync(path)) return;
  const previous = { ...process.env };
  process.loadEnvFile(path);
  for (const [key, value] of Object.entries(previous)) {
    process.env[key] = value;
  }
}
