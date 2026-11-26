// Zona horaria institucional y conversión de fechas (decisión aprobada para la tarea 3.24).
//
// - Los instantes (eventos con hora, entregas, sesiones…) se guardan en UTC y se muestran en la zona
//   institucional.
// - Las fechas naturales (cumpleaños, Días_Inhábiles, feriados) son "AAAA-MM-DD" sin zona horaria:
//   cuando vienen de la base de datos como DateTime se leen con sus partes UTC, sin convertir.
// - Los turnos y horarios ("HH:mm") se interpretan en la zona institucional.
// - Los límites de un día natural se calculan en la zona institucional y se convierten a UTC.
// La zona se define solo aquí; cambiarla es modificar INSTITUTIONAL_TIME_ZONE.

export const INSTITUTIONAL_TIME_ZONE = 'America/Mexico_City';

/** Fecha natural "AAAA-MM-DD". */
export type NaturalDate = string;

const NATURAL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, '0');

/** Partes de una fecha natural; lanza RangeError si no es una fecha real (por ejemplo 2026-02-30). */
export function parseNaturalDate(date: NaturalDate): { year: number; month: number; day: number } {
  const match = NATURAL_DATE.exec(date);
  if (!match) throw new RangeError(`Fecha natural inválida: ${date}.`);
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new RangeError(`Fecha natural inválida: ${date}.`);
  }
  return { year, month, day };
}

export const isNaturalDate = (value: unknown): value is NaturalDate => {
  if (typeof value !== 'string') return false;
  try {
    parseNaturalDate(value);
    return true;
  } catch {
    return false;
  }
};

const assertInstant = (name: string, value: Date) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new RangeError(`${name} no es una fecha válida.`);
};

/** Fecha natural guardada como DateTime (medianoche UTC): se leen sus partes UTC, sin zona horaria. */
export function naturalDateOf(stored: Date): NaturalDate {
  assertInstant('stored', stored);
  return `${pad(stored.getUTCFullYear(), 4)}-${pad(stored.getUTCMonth() + 1)}-${pad(stored.getUTCDate())}`;
}

/** Fecha natural como DateTime de medianoche UTC (forma de guardarla). */
export function naturalDateToStored(date: NaturalDate): Date {
  const { year, month, day } = parseNaturalDate(date);
  return new Date(Date.UTC(year, month - 1, day));
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Partes de calendario y reloj de un instante en la zona indicada. */
export function zonedParts(instant: Date, timeZone = INSTITUTIONAL_TIME_ZONE) {
  assertInstant('instant', instant);
  const parts = Object.fromEntries(formatter(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/** Diferencia en milisegundos entre la hora de la zona y UTC en ese instante (México: -6 h). */
export function zoneOffsetMs(instant: Date, timeZone = INSTITUTIONAL_TIME_ZONE): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Fecha natural de un instante en la zona institucional. */
export function localDateOf(instant: Date, timeZone = INSTITUTIONAL_TIME_ZONE): NaturalDate {
  const p = zonedParts(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** Instante UTC de una fecha natural y una hora "HH:mm" de la zona institucional. */
export function zonedTimeToUtc(date: NaturalDate, time: string, timeZone = INSTITUTIONAL_TIME_ZONE): Date {
  const { year, month, day } = parseNaturalDate(date);
  const t = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!t) throw new RangeError(`Hora inválida: ${time}.`);
  const wallClock = Date.UTC(year, month - 1, day, Number(t[1]), Number(t[2]));
  // Primera aproximación con el desfase de ese momento y corrección si el desfase cambia (horario de verano).
  let guess = wallClock - zoneOffsetMs(new Date(wallClock), timeZone);
  const corrected = wallClock - zoneOffsetMs(new Date(guess), timeZone);
  if (corrected !== guess) guess = corrected;
  return new Date(guess);
}

/** Límites de un día natural en la zona institucional, en UTC: [00:00, 23:59:59.999]. */
export function dayRange(date: NaturalDate, timeZone = INSTITUTIONAL_TIME_ZONE): { start: Date; end: Date } {
  const start = zonedTimeToUtc(date, '00:00', timeZone);
  const next = zonedTimeToUtc(addDays(date, 1), '00:00', timeZone);
  return { start, end: new Date(next.getTime() - 1) };
}

/** Suma días a una fecha natural. */
export function addDays(date: NaturalDate, days: number): NaturalDate {
  const { year, month, day } = parseNaturalDate(date);
  return naturalDateOf(new Date(Date.UTC(year, month - 1, day + days)));
}

/** Día de la semana de una fecha natural: 0 = domingo … 6 = sábado (como ScheduleSlot.dayOfWeek). */
export function dayOfWeek(date: NaturalDate): number {
  const { year, month, day } = parseNaturalDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export const isLeapYear = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
