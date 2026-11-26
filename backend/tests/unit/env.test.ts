import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { EnvValidationError, loadEnv, loadEnvOrExit } from '../../src/config/env';

/** Secretos y contraseñas de prueba generados en cada ejecución: ninguno queda escrito en el código. */
const randomValue = (bytes: number) => randomBytes(bytes).toString('hex');

const SECRET = randomValue(24);
const valid = {
  SESSION_SECRET: SECRET,
  DATABASE_URL: 'file:./dev.db',
  CORS_ORIGIN: 'http://localhost:5173',
};

function issuesOf(env: Record<string, string | undefined>) {
  try {
    loadEnv(env);
  } catch (error) {
    if (error instanceof EnvValidationError) return error.issues;
    throw error;
  }
  return [];
}

describe('loadEnv', () => {
  it('devuelve la configuración con valores por defecto si las obligatorias son válidas', () => {
    const { config, warnings } = loadEnv(valid);
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.frontendUrl).toBe('http://localhost:5173');
    expect(config.smtp).toBeNull();
    expect(warnings).toEqual([]);
  });

  it('nombra SESSION_SECRET cuando falta o está vacía', () => {
    expect(issuesOf({ ...valid, SESSION_SECRET: undefined }).map((i) => i.variable)).toEqual(['SESSION_SECRET']);
    expect(issuesOf({ ...valid, SESSION_SECRET: '   ' }).map((i) => i.variable)).toEqual(['SESSION_SECRET']);
  });

  it('nombra todas las variables obligatorias que faltan', () => {
    expect(issuesOf({}).map((i) => i.variable).sort()).toEqual(['CORS_ORIGIN', 'DATABASE_URL', 'SESSION_SECRET']);
  });

  it('rechaza un SESSION_SECRET corto sin incluir su valor en el mensaje', () => {
    const shortSecret = randomValue(8);
    let message = '';
    try {
      loadEnv({ ...valid, SESSION_SECRET: shortSecret });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('SESSION_SECRET');
    expect(message).not.toContain(shortSecret);
  });

  describe('SESSION_SECRET reforzado', () => {
    const messageOf = (secret: string) => {
      const issues = issuesOf({ ...valid, SESSION_SECRET: secret });
      expect(issues.map((i) => i.variable)).toEqual(['SESSION_SECRET']);
      const text = issues.map((i) => i.message).join('\n');
      expect(text).not.toContain(secret.trim());
      return issues[0]?.message ?? '';
    };

    it('acepta exactamente 32 caracteres y rechaza 31', () => {
      const secret32 = randomValue(16);
      expect(secret32).toHaveLength(32);
      expect(issuesOf({ ...valid, SESSION_SECRET: secret32 })).toEqual([]);
      expect(messageOf(secret32.slice(0, 31))).toBe('Debe tener al menos 32 caracteres.');
    });

    it('rechaza espacios al principio o al final, aunque el resto tenga 32 caracteres o más', () => {
      const secret = randomValue(20);
      for (const value of [` ${secret}`, `${secret} `, `\t${secret}`, `${secret}\n`, `  ${secret}  `]) {
        expect(messageOf(value)).toBe('No debe tener espacios al principio ni al final.');
      }
    });

    it('acepta espacios en medio si cumple las demás reglas', () => {
      const secret = `${randomValue(10)} ${randomValue(10)}`;
      expect(issuesOf({ ...valid, SESSION_SECRET: secret })).toEqual([]);
    });

    it('rechaza un solo carácter repetido, también con caracteres de varios bytes', () => {
      expect(messageOf('a'.repeat(32))).toBe('No puede estar formado por un solo carácter repetido.');
      expect(messageOf('7'.repeat(64))).toBe('No puede estar formado por un solo carácter repetido.');
      expect(messageOf('🔒'.repeat(32))).toBe('No puede estar formado por un solo carácter repetido.');
      expect(issuesOf({ ...valid, SESSION_SECRET: `${'a'.repeat(31)}b` })).toEqual([]);
    });

    it('loadEnvOrExit no escribe el secreto en la consola', () => {
      const secret = `${randomValue(16)} `;
      const logs: string[] = [];
      const exit = ((code: number) => {
        throw new Error(`exit:${code}`);
      }) as (code: number) => never;
      expect(() => loadEnvOrExit({ ...valid, SESSION_SECRET: secret }, (m) => logs.push(m), exit)).toThrow('exit:1');
      expect(logs.join('\n')).toContain('SESSION_SECRET');
      expect(logs.join('\n')).not.toContain(secret.trim());
    });
  });

  it('valida formatos de DATABASE_URL, CORS_ORIGIN y PORT', () => {
    const vars = issuesOf({
      ...valid,
      DATABASE_URL: 'postgres://x',
      CORS_ORIGIN: 'http://localhost:5173/',
      PORT: '70000',
    }).map((i) => i.variable);
    expect(vars.sort()).toEqual(['CORS_ORIGIN', 'DATABASE_URL', 'PORT']);
  });

  it('usa SMTP solo con las cinco variables y avisa si la configuración está incompleta', () => {
    const smtpPassword = randomValue(10);
    const smtp = {
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_USER: 'demo',
      SMTP_PASSWORD: smtpPassword,
      SMTP_FROM: 'Hospital <no-responder@example.com>',
    };
    expect(loadEnv({ ...valid, ...smtp }).config.smtp?.port).toBe(587);

    const partial = loadEnv({ ...valid, SMTP_HOST: 'smtp.example.com', SMTP_PASSWORD: smtpPassword });
    expect(partial.config.smtp).toBeNull();
    expect(partial.warnings[0]).toContain('SMTP_PORT');
    expect(partial.warnings[0]).not.toContain('smtp.example.com');
    expect(partial.warnings[0]).not.toContain(smtpPassword);
  });

  it('valida las contraseñas demo opcionales sin mostrarlas', () => {
    const tooShort = randomValue(2); // 4 caracteres
    const vars = issuesOf({ ...valid, DEMO_ADMIN_PASSWORD: tooShort });
    expect(vars).toEqual([{ variable: 'DEMO_ADMIN_PASSWORD', message: expect.any(String) }]);
    expect(vars[0]?.message).not.toContain(tooShort);

    const validPassword = randomValue(8); // 16 caracteres
    expect(loadEnv({ ...valid, DEMO_ADMIN_PASSWORD: validPassword }).config.demoPasswords).toEqual({
      DEMO_ADMIN_PASSWORD: validPassword,
    });
  });
});

describe('loadEnvOrExit', () => {
  it('escribe el error y termina con código 1', () => {
    const logs: string[] = [];
    const exit = (code: number): never => {
      throw new Error(`exit:${code}`);
    };
    expect(() => loadEnvOrExit({ ...valid, SESSION_SECRET: undefined }, (m) => logs.push(m), exit)).toThrow('exit:1');
    expect(logs.join('\n')).toContain('SESSION_SECRET');
  });
});
