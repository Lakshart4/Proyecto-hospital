// Servicio de correo (Req. 16.8, 16.9, 17.3, 17.4, 17.11).
//
// `createMailService` elige el transporte según la configuración validada por loadEnv:
// - SMTP (nodemailer) si existen las cinco variables SMTP_*.
// - Bandeja_Local si no hay SMTP y el entorno no es de producción: escribe en la consola del Backend el
//   destinatario, el asunto y el texto (con el enlace) y conserva los mensajes en memoria. Es el único
//   lugar donde aparece el enlace con el token, como exige el Req. 17.4.
// - En producción sin SMTP no se envía nada y se registra una advertencia sin datos del mensaje.
// Un fallo de envío nunca se propaga a la respuesta: se registra un aviso genérico (sin destinatario,
// enlace, token ni credenciales) y `send` devuelve false.

import nodemailer from 'nodemailer';
import type { NodeEnv, SmtpConfig } from '../config/env';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export type MailMode = 'smtp' | 'local' | 'disabled';

export interface MailService {
  readonly mode: MailMode;
  /** Envía el mensaje. Devuelve false si no se pudo enviar (el error ya quedó registrado sin datos sensibles). */
  send(message: MailMessage): Promise<boolean>;
  /** Mensajes de la Bandeja_Local (solo en modo local). */
  readonly outbox: readonly MailMessage[];
}

/** Lo mínimo que se usa de nodemailer; se inyecta en las pruebas para no abrir conexiones reales. */
export type SmtpTransportFactory = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}) => { sendMail(mail: { from: string; to: string; subject: string; text: string }): Promise<unknown> };

export const MAIL_SEND_FAILED_WARNING = 'Aviso: no se pudo enviar un correo. Revisa la configuración SMTP.';
export const MAIL_DISABLED_WARNING =
  'Aviso: no hay servidor SMTP configurado en producción; los correos de recuperación no se enviarán.';

const nodemailerFactory: SmtpTransportFactory = (options) => nodemailer.createTransport(options);

export function smtpTransport(config: SmtpConfig, factory: SmtpTransportFactory = nodemailerFactory): MailTransport {
  const transporter = factory({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.password },
  });
  return {
    async send(message) {
      await transporter.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text });
    },
  };
}

export function localOutboxTransport(outbox: MailMessage[], log: (line: string) => void): MailTransport {
  return {
    async send(message) {
      outbox.push({ ...message });
      log(['[Bandeja_Local] Correo de desarrollo (no se envió por SMTP)', `Para: ${message.to}`, `Asunto: ${message.subject}`, message.text].join('\n'));
    },
  };
}

export interface MailServiceOptions {
  nodeEnv: NodeEnv;
  smtp: SmtpConfig | null;
  /** Consola de la Bandeja_Local (por defecto, console.log). */
  log?: (line: string) => void;
  /** Avisos sin datos sensibles (por defecto, console.warn). */
  warn?: (line: string) => void;
  smtpFactory?: SmtpTransportFactory;
}

export function createMailService(options: MailServiceOptions): MailService {
  const warn = options.warn ?? ((line: string) => console.warn(line));
  const outbox: MailMessage[] = [];
  let mode: MailMode;
  let transport: MailTransport | null;

  if (options.smtp) {
    mode = 'smtp';
    transport = smtpTransport(options.smtp, options.smtpFactory);
  } else if (options.nodeEnv !== 'production') {
    mode = 'local';
    transport = localOutboxTransport(outbox, options.log ?? ((line: string) => console.log(line)));
  } else {
    mode = 'disabled';
    transport = null;
    warn(MAIL_DISABLED_WARNING);
  }

  return {
    mode,
    outbox,
    async send(message) {
      if (transport === null) {
        warn(MAIL_DISABLED_WARNING);
        return false;
      }
      try {
        await transport.send(message);
        return true;
      } catch {
        warn(MAIL_SEND_FAILED_WARNING);
        return false;
      }
    },
  };
}

// ---------- Plantillas en español ----------

/** Correo con el enlace de restablecimiento `FRONTEND_URL/restablecer?token=...` (vigencia de 30 minutos). */
export function passwordResetEmail(to: string, frontendUrl: string, token: string): MailMessage {
  const link = `${frontendUrl.replace(/\/+$/, '')}/restablecer?token=${encodeURIComponent(token)}`;
  return {
    to,
    subject: 'Restablecimiento de contraseña',
    text: [
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
      `Para elegir una contraseña nueva abre este enlace (vence en 30 minutos): ${link}`,
      'Si no solicitaste el cambio, ignora este mensaje: tu contraseña no cambiará.',
    ].join('\n'),
  };
}
