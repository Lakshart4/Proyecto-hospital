// Servicio de feriados con Nager.Date y caché en memoria (Req. 11.1, 11.3, 11.5, 11.6, 16.9).
//
// - Valida el año con `parseYear` antes de consultar (un año inválido lanza 400 sin llamar a `fetch`).
// - Consulta `GET {baseUrl}/api/v3/PublicHolidays/{año}/{país}` sin claves, con un límite de 3 s
//   (AbortController).
// - Guarda en memoria solo las respuestas correctas, durante 24 horas por año y país.
// - Si Nager.Date falla, responde con error, con un cuerpo inválido o tarda más de 3 s, devuelve
//   `{ available: false, data: [] }` y no guarda nada; el resto del calendario sigue funcionando.
// `fetch`, el reloj y el límite de tiempo se inyectan para poder probarlo sin conexión.

import type { HolidayLike } from '../domain/events';
import { parseNagerHolidays, parseYear } from '../domain/holidays';

export const NAGER_BASE_URL = 'https://date.nager.at';
export const HOLIDAY_TIMEOUT_MS = 3_000;
export const HOLIDAY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface HolidaysResult {
  available: boolean;
  data: HolidayLike[];
}

export type FetchLike = (url: string, init: { signal: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

export interface HolidayServiceOptions {
  /** Integración habilitada (NAGER_ENABLED). */
  enabled: boolean;
  /** Código de país de dos letras (NAGER_COUNTRY). */
  country: string;
  fetch: FetchLike;
  /** Reloj en milisegundos (por defecto, Date.now). */
  now?: () => number;
  timeoutMs?: number;
  cacheTtlMs?: number;
  baseUrl?: string;
}

export interface HolidayService {
  /** Feriados del año pedido (texto de la query string o número). @throws ValidationError si el año es inválido. */
  getHolidays(yearInput: unknown): Promise<HolidaysResult>;
}

const UNAVAILABLE = (): HolidaysResult => ({ available: false, data: [] });

export function createHolidayService(options: HolidayServiceOptions): HolidayService {
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? HOLIDAY_TIMEOUT_MS;
  const ttlMs = options.cacheTtlMs ?? HOLIDAY_CACHE_TTL_MS;
  const baseUrl = (options.baseUrl ?? NAGER_BASE_URL).replace(/\/+$/, '');
  const cache = new Map<string, { storedAt: number; data: HolidayLike[] }>();

  async function fetchFromNager(year: number): Promise<HolidayLike[] | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `${baseUrl}/api/v3/PublicHolidays/${year}/${encodeURIComponent(options.country)}`;
      const response = await options.fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return parseNagerHolidays(await response.json(), year);
    } catch {
      // Error de red, tiempo agotado (abort) o JSON inválido: feriados no disponibles.
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getHolidays(yearInput) {
      const year = parseYear(yearInput);
      if (!options.enabled) return UNAVAILABLE();

      const key = `${options.country}:${year}`;
      const cached = cache.get(key);
      if (cached && now() - cached.storedAt < ttlMs) return { available: true, data: cached.data.map((h) => ({ ...h })) };

      const data = await fetchFromNager(year);
      if (data === null) return UNAVAILABLE();
      cache.set(key, { storedAt: now(), data });
      return { available: true, data: data.map((h) => ({ ...h })) };
    },
  };
}
