// Pruebas de propiedades de `loadEnv` (tarea 1.5).
// La Property 42 del diseño tiene una única prueba. Las demás pruebas de este archivo
// complementan la validación de variables (Req. 16.5, 16.6, 16.7, 17.11) y no llevan número.

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  EnvValidationError,
  REQUIRED_ENV_VARS,
  SESSION_SECRET_MIN_LENGTH,
  SMTP_ENV_VARS,
  loadEnv,
  type LoadedEnv,
} from '../../src/config/env';

const RUNS = { numRuns: 100 };

/** Marca que se inserta en los valores para detectar si aparecen en los mensajes. */
const MARK = 'ZZQ';

type Env = Record<string, string | undefined>;
type Outcome = { ok: true; result: LoadedEnv } | { ok: false; error: EnvValidationError };

function run(env: Env): Outcome {
  try {
    return { ok: true, result: loadEnv(env) };
  } catch (error) {
    if (error instanceof EnvValidationError) return { ok: false, error };
    throw error;
  }
}

function failedVariables(outcome: Outcome): string[] {
  return outcome.ok ? [] : outcome.error.issues.map((issue) => issue.variable).sort();
}

// ---------- Generadores ----------

const nonBlank = (arb: fc.Arbitrary<string>) => arb.filter((value) => value.trim() !== '');

const hostArb = fc.constantFrom('localhost', '127.0.0.1', 'example.com', 'hospital.example.org');
const originArb = fc
  .tuple(
    fc.constantFrom('http', 'https'),
    hostArb,
    fc.option(fc.integer({ min: 1024, max: 65535 }), { nil: undefined }),
  )
  .map(([protocol, host, port]) => `${protocol}://${host}${port === undefined ? '' : `:${port}`}`);

// Secretos válidos: sin espacios al principio ni al final y no formados por un solo carácter repetido.
const secretArb = fc
  .string({ minLength: SESSION_SECRET_MIN_LENGTH, maxLength: 128 })
  .filter((value) => value === value.trim() && new Set(value).size > 1);
const dbUrlArb = fc.stringMatching(/^[a-z0-9_]{1,20}$/).map((name) => `file:./${name}.db`);

const requiredArb = fc.record({
  SESSION_SECRET: secretArb,
  DATABASE_URL: dbUrlArb,
  CORS_ORIGIN: originArb,
});

/** Formas de "no definida": ausente, vacía o solo espacios. */
const blankArb = fc.constantFrom<string | undefined>(undefined, '', ' ', '  \t ');

const smtpFullArb = fc.record({
  SMTP_HOST: hostArb.map((host) => `${MARK}${host}`),
  SMTP_PORT: fc.integer({ min: 1, max: 65535 }).map(String),
  SMTP_USER: fc.stringMatching(/^[a-z]{1,12}$/).map((user) => `${MARK}${user}`),
  SMTP_PASSWORD: fc.string({ maxLength: 40 }).map((password) => `${MARK}${password}`),
  SMTP_FROM: fc.stringMatching(/^[a-z]{1,10}$/).map((user) => `${MARK} <${user}@example.com>`),
});

const invalidPortArb = fc.oneof(
  fc.integer({ min: 65536, max: 10_000_000 }).map(String),
  fc.integer({ min: -1000, max: 0 }).map(String),
  fc.constantFrom('3000a', '1.5', ' 3000', 'abc', '3e3'),
);

/** Valores inválidos por variable. Todos empiezan por MARK para detectar fugas en los mensajes. */
const invalidByVar: Record<string, fc.Arbitrary<string>> = {
  SESSION_SECRET: fc.oneof(
    fc.string({ maxLength: SESSION_SECRET_MIN_LENGTH - 1 - MARK.length }),
    // Largo suficiente, pero con espacios al final.
    fc.tuple(fc.string({ minLength: SESSION_SECRET_MIN_LENGTH, maxLength: 64 }), fc.constantFrom(' ', '\t', '  ')).map(([s, ws]) => s + ws),
  ),
  DATABASE_URL: fc.oneof(fc.string(), fc.constantFrom('postgres://x', 'sqlite:./a.db', './dev.db')),
  CORS_ORIGIN: fc.oneof(
    originArb.map((origin) => `${origin}/`),
    originArb.map((origin) => `${origin}/api`),
    hostArb.map((host) => `ftp://${host}`),
    hostArb,
    fc.constantFrom('http://localhost:80', 'https://example.com:443', '*'),
  ),
  PORT: invalidPortArb,
  NODE_ENV: fc.string(),
  FRONTEND_URL: fc.oneof(hostArb, hostArb.map((host) => `ftp://${host}`), fc.constantFrom('no es una url')),
  NAGER_ENABLED: fc.string(),
  NAGER_COUNTRY: fc.string(),
  SMTP_PORT: invalidPortArb,
  SMTP_FROM: fc.oneof(hostArb, fc.constantFrom('sin-arroba', 'a@b', 'Hospital <>')),
  DEMO_ADMIN_PASSWORD: fc.oneof(
    fc.string({ minLength: 1, maxLength: 7 - MARK.length }),
    fc.string({ minLength: 129, maxLength: 200 }),
  ),
};
const invalidVarNames = Object.keys(invalidByVar);

const markedInvalid = (name: string) => (invalidByVar[name] as fc.Arbitrary<string>).map((value) => `${MARK}${value}`);

const oneInvalidArb = fc
  .constantFrom(...invalidVarNames)
  .chain((name) => markedInvalid(name).map((value) => [name, value] as const));

const someInvalidArb = fc
  .record(
    Object.fromEntries(invalidVarNames.map((name) => [name, fc.option(markedInvalid(name), { nil: undefined })])),
  )
  .filter((values) => Object.values(values).some((value) => value !== undefined));

// ---------- Propiedades ----------

describe('loadEnv (propiedades)', () => {
  // Feature: hospital-management-system, Property 42: Variables de entorno requeridas
  it('Property 42: falla nombrando cada variable requerida faltante; con todas devuelve la configuración y SMTP es opcional', () => {
    fc.assert(
      fc.property(
        requiredArb,
        fc.subarray([...REQUIRED_ENV_VARS]),
        blankArb,
        fc.option(smtpFullArb, { nil: undefined }),
        (required, missing, blank, smtp) => {
          const env: Env = { ...required, ...smtp };
          for (const name of missing) env[name] = blank;

          const outcome = run(env);

          if (missing.length === 0) {
            expect(outcome.ok).toBe(true);
            if (!outcome.ok) return;
            const { config } = outcome.result;
            expect(config.sessionSecret).toBe(required.SESSION_SECRET);
            expect(config.databaseUrl).toBe(required.DATABASE_URL);
            expect(config.corsOrigin).toBe(required.CORS_ORIGIN);
            expect(config.smtp === null).toBe(smtp === undefined);
          } else {
            expect(failedVariables(outcome)).toEqual([...missing].sort());
            if (outcome.ok) return;
            for (const name of missing) expect(outcome.error.message).toContain(name);
          }
        },
      ),
      RUNS,
    );
  });

  it('nunca acepta un valor inválido y señala exactamente la variable inválida', () => {
    fc.assert(
      fc.property(requiredArb, oneInvalidArb, (required, [name, value]) => {
        const outcome = run({ ...required, [name]: value });
        expect(outcome.ok).toBe(false);
        expect(failedVariables(outcome)).toEqual([name]);
      }),
      RUNS,
    );
  });

  it('los mensajes de error no contienen los valores de las variables, ni válidos ni inválidos', () => {
    fc.assert(
      fc.property(
        requiredArb,
        secretArb,
        smtpFullArb,
        someInvalidArb,
        (required, secret, smtp, invalid) => {
          const env: Env = { ...required, SESSION_SECRET: `${MARK}${secret}`, ...smtp };
          for (const [name, value] of Object.entries(invalid)) {
            if (value !== undefined) env[name] = value;
          }

          const outcome = run(env);
          expect(outcome.ok).toBe(false);
          if (outcome.ok) return;
          expect(outcome.error.message).not.toContain(MARK);
          for (const issue of outcome.error.issues) expect(issue.message).not.toContain(MARK);
        },
      ),
      RUNS,
    );
  });

  it('aplica los valores predeterminados a las opcionales no definidas y respeta las definidas', () => {
    const suffixArb = fc.constantFrom(
      { path: '', expected: '' },
      { path: '/', expected: '' },
      { path: '/app', expected: '/app' },
      { path: '/app//', expected: '/app' },
    );
    const optionalArb = fc.record({
      PORT: fc.oneof(blankArb, fc.integer({ min: 1, max: 65535 }).map(String)),
      NODE_ENV: fc.oneof(blankArb, fc.constantFrom('development', 'test', 'production')),
      FRONTEND_URL: fc.oneof(
        blankArb.map((value) => ({ value, expected: 'http://localhost:5173' })),
        fc.tuple(originArb, suffixArb).map(([origin, suffix]) => ({
          value: origin + suffix.path,
          expected: origin + suffix.expected,
        })),
      ),
      NAGER_ENABLED: fc.oneof(blankArb, fc.constantFrom('true', 'false')),
      NAGER_COUNTRY: fc.oneof(blankArb, fc.stringMatching(/^[A-Z]{2}$/)),
      SMTP: blankArb,
      DEMO_ADMIN_PASSWORD: blankArb,
    });

    fc.assert(
      fc.property(requiredArb, optionalArb, (required, optional) => {
        const isSet = (value: string | undefined): value is string => value !== undefined && value.trim() !== '';
        const env: Env = {
          ...required,
          PORT: optional.PORT,
          NODE_ENV: optional.NODE_ENV,
          FRONTEND_URL: optional.FRONTEND_URL.value,
          NAGER_ENABLED: optional.NAGER_ENABLED,
          NAGER_COUNTRY: optional.NAGER_COUNTRY,
          DEMO_ADMIN_PASSWORD: optional.DEMO_ADMIN_PASSWORD,
        };
        for (const name of SMTP_ENV_VARS) env[name] = optional.SMTP;

        const outcome = run(env);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { config, warnings } = outcome.result;

        expect(config.port).toBe(isSet(optional.PORT) ? Number(optional.PORT) : 3000);
        expect(config.nodeEnv).toBe(isSet(optional.NODE_ENV) ? optional.NODE_ENV : 'development');
        expect(config.frontendUrl).toBe(optional.FRONTEND_URL.expected);
        expect(config.nager.enabled).toBe(isSet(optional.NAGER_ENABLED) ? optional.NAGER_ENABLED === 'true' : true);
        expect(config.nager.country).toBe(isSet(optional.NAGER_COUNTRY) ? optional.NAGER_COUNTRY : 'MX');
        expect(config.smtp).toBeNull();
        expect(config.demoPasswords).toEqual({});
        expect(warnings).toEqual([]);
      }),
      RUNS,
    );
  });

  it('usa SMTP solo con las cinco variables; si faltan algunas avisa cuáles, sin mostrar valores', () => {
    fc.assert(
      fc.property(requiredArb, smtpFullArb, fc.subarray([...SMTP_ENV_VARS]), blankArb, (required, smtp, present, blank) => {
        const env: Env = { ...required };
        for (const name of SMTP_ENV_VARS) env[name] = present.includes(name) ? smtp[name] : blank;
        const missing = SMTP_ENV_VARS.filter((name) => !present.includes(name));

        const outcome = run(env);
        expect(outcome.ok).toBe(true);
        if (!outcome.ok) return;
        const { config, warnings } = outcome.result;

        if (missing.length === 0) {
          expect(config.smtp).toEqual({
            host: smtp.SMTP_HOST,
            port: Number(smtp.SMTP_PORT),
            user: smtp.SMTP_USER,
            password: smtp.SMTP_PASSWORD,
            from: smtp.SMTP_FROM,
          });
          expect(warnings).toEqual([]);
        } else if (present.length === 0) {
          expect(config.smtp).toBeNull();
          expect(warnings).toEqual([]);
        } else {
          expect(config.smtp).toBeNull();
          expect(warnings).toHaveLength(1);
          const warning = warnings[0] ?? '';
          for (const name of missing) expect(warning).toContain(name);
          for (const name of present) expect(warning).not.toContain(name);
          expect(warning).not.toContain(MARK);
        }
      }),
      RUNS,
    );
  });
});
