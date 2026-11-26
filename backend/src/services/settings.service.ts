import { INSTITUTIONAL_TIME_ZONE } from '../domain/time';
import { ValidationError, type FieldError } from '../lib/errors';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import { withTransaction } from '../repositories/transaction';

export const DEFAULT_INSTITUTION_NAME = 'Hospital General';
export const SUPPORTED_TIME_ZONES = [
  'America/Mexico_City',
  'America/Monterrey',
  'America/Tijuana',
  'America/Cancun',
  'America/Bogota',
  'America/Lima',
  'America/Argentina/Buenos_Aires',
  'UTC',
] as const;

export interface InstitutionSettings { name: string; timeZone: string; updatedAt: Date }
export interface SettingsService {
  get(): Promise<InstitutionSettings>;
  update(actorId: number, input: { name: string; timeZone: string }): Promise<InstitutionSettings>;
}

function validateTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function createSettingsService(db: Database): SettingsService {
  const get = async (): Promise<InstitutionSettings> => {
    return db.institutionConfig.upsert({
      where: { id: 1 },
      create: { id: 1, name: DEFAULT_INSTITUTION_NAME, timeZone: INSTITUTIONAL_TIME_ZONE, updatedAt: new Date() },
      update: {},
      select: { name: true, timeZone: true, updatedAt: true },
    });
  };

  return {
    get,
    async update(actorId, input) {
      const errors: FieldError[] = [];
      const name = typeof input.name === 'string' ? input.name.trim() : '';
      if (name.length < 1 || name.length > 120) errors.push({ field: 'name', message: 'El nombre debe tener entre 1 y 120 caracteres.' });
      if (!validateTimeZone(input.timeZone)) errors.push({ field: 'timeZone', message: 'La zona horaria no es válida.' });
      if (errors.length > 0) throw new ValidationError('Los datos de configuración no son válidos.', errors);

      return withTransaction(async (tx) => {
        const previous = await tx.institutionConfig.upsert({
          where: { id: 1 },
          create: { id: 1, name: DEFAULT_INSTITUTION_NAME, timeZone: INSTITUTIONAL_TIME_ZONE, updatedAt: new Date() },
          update: {},
        });
        const saved = await tx.institutionConfig.update({
          where: { id: 1 },
          data: { name, timeZone: input.timeZone },
          select: { name: true, timeZone: true, updatedAt: true },
        });
        await writeAudit(tx, {
          userId: actorId,
          action: 'SETTINGS_UPDATE',
          entityType: 'InstitutionConfig',
          entityId: 1,
          details: { previousName: previous.name, previousTimeZone: previous.timeZone, name: saved.name, timeZone: saved.timeZone },
        });
        return saved;
      }, { client: db });
    },
  };
}
