// Formatos de fecha y hora para la interfaz, en la zona horaria del hospital (la misma del Backend).

export const TIME_ZONE = 'America/Mexico_City';

const timeFormatter = new Intl.DateTimeFormat('es-MX', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const dateFormatter = new Intl.DateTimeFormat('es-MX', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** Hora local en formato 24 h, por ejemplo "14:05". */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

/** Formatea una fecha `YYYY-MM-DD` o ISO sin desplazar un día cuando es solo fecha. */
export function formatDate(value: string | Date): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(?:T00:00:00(?:\.000)?Z)?$/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return dateFormatter.format(date);
}

/** Formatea fecha y hora en la zona horaria del hospital. */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return String(value);
  return dateTimeFormatter.format(date);
}
