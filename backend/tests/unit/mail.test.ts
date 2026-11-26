// Pruebas del servicio de correo (tarea 4.22; Req. 16.8, 16.9, 17.3, 17.4, 17.11).
// El transporte SMTP se reemplaza por una fábrica de prueba: no se abre ninguna conexión real.
// Credenciales y tokens se generan en cada ejecución.

import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { SmtpConfig } from '../../src/config/env';
import {
  MAIL_DISABLED_WARNING,
  MAIL_SEND_FAILED_WARNING,
  createMailService,
  passwordResetEmail,
  type SmtpTransportFactory,
} from '../../src/mail/mail.service';
import { generateToken } from '../../src/lib/tokens';

const smtpConfig = (port = 587): SmtpConfig => ({
  host: 'smtp.example.com',
  port,
  user: 'usuario-smtp',
  password: randomBytes(12).toString('hex'),
  from: 'Hospital <no-responder@example.com>',
});

function recordingFactory(fail = false) {
  const created: Parameters<SmtpTransportFactory>[0][] = [];
  const sent: unknown[] = [];
  const factory: SmtpTransportFactory = (options) => {
    created.push(options);
    return {
      async sendMail(mail) {
        if (fail) throw new Error(`Fallo SMTP para ${mail.to}: ${mail.text}`);
        sent.push(mail);
      },
    };
  };
  return { factory, created, sent };
}

describe('createMailService', () => {
  it('sin SMTP y fuera de producción usa la Bandeja_Local: escribe en consola y guarda el mensaje', async () => {
    const logs: string[] = [];
    const mail = createMailService({ nodeEnv: 'development', smtp: null, log: (l) => logs.push(l) });
    expect(mail.mode).toBe('local');
    const token = generateToken();
    const message = passwordResetEmail('ana@example.com', 'http://localhost:5173/', token);
    expect(await mail.send(message)).toBe(true);
    expect(mail.outbox).toEqual([message]);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('[Bandeja_Local]');
    expect(logs[0]).toContain('Para: ana@example.com');
    expect(logs[0]).toContain(`http://localhost:5173/restablecer?token=${token}`);
  });

  it('con las cinco variables SMTP usa nodemailer con esa configuración (Secure solo en el puerto 465)', async () => {
    for (const [port, secure] of [[587, false], [465, true]] as const) {
      const config = smtpConfig(port);
      const { factory, created, sent } = recordingFactory();
      const mail = createMailService({ nodeEnv: 'production', smtp: config, smtpFactory: factory });
      expect(mail.mode).toBe('smtp');
      expect(created).toEqual([{ host: config.host, port, secure, auth: { user: config.user, pass: config.password } }]);
      expect(await mail.send({ to: 'b@example.com', subject: 'Asunto', text: 'Texto' })).toBe(true);
      expect(sent).toEqual([{ from: config.from, to: 'b@example.com', subject: 'Asunto', text: 'Texto' }]);
      expect(mail.outbox).toEqual([]);
    }
  });

  it('un error de envío devuelve false y solo registra un aviso genérico, sin destinatario, token ni credenciales', async () => {
    const config = smtpConfig();
    const warnings: string[] = [];
    const { factory } = recordingFactory(true);
    const mail = createMailService({ nodeEnv: 'development', smtp: config, smtpFactory: factory, warn: (w) => warnings.push(w) });
    const token = generateToken();
    expect(await mail.send(passwordResetEmail('secreto@example.com', 'http://x', token))).toBe(false);
    expect(warnings).toEqual([MAIL_SEND_FAILED_WARNING]);
    for (const value of [token, 'secreto@example.com', config.password, config.user]) expect(warnings.join('\n')).not.toContain(value);
  });

  it('en producción sin SMTP no envía nada y avisa, sin datos del mensaje', async () => {
    const warnings: string[] = [];
    const logs: string[] = [];
    const mail = createMailService({ nodeEnv: 'production', smtp: null, warn: (w) => warnings.push(w), log: (l) => logs.push(l) });
    expect(mail.mode).toBe('disabled');
    const token = generateToken();
    expect(await mail.send(passwordResetEmail('c@example.com', 'http://x', token))).toBe(false);
    expect(warnings).toEqual([MAIL_DISABLED_WARNING, MAIL_DISABLED_WARNING]);
    expect(logs).toEqual([]);
    expect(warnings.join('\n')).not.toContain(token);
    expect(mail.outbox).toEqual([]);
  });
});

describe('passwordResetEmail', () => {
  it('arma el enlace FRONTEND_URL/restablecer?token= en español con la vigencia', () => {
    const message = passwordResetEmail('d@example.com', 'https://hospital.example.com//', 'a b');
    expect(message.to).toBe('d@example.com');
    expect(message.subject).toBe('Restablecimiento de contraseña');
    expect(message.text).toContain('https://hospital.example.com/restablecer?token=a%20b');
    expect(message.text).toContain('30 minutos');
  });
});
