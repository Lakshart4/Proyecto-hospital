// Paleta única del Frontend (Req. 15.2, 15.7, 15.14, 15.16; diseño "Lineamientos" y "Colores de estado").
//
// Los valores hexadecimales viven solo aquí. tailwind.config.ts los importa como colores del tema, y los
// componentes usan las clases que se exportan abajo (escritas completas para que Tailwind las detecte).
// Los estados siempre se muestran con color y con su texto visible.

/** Colores base. Coinciden con la paleta de Tailwind indicada en el diseño. */
export const BASE_COLORS = {
  /** Fondo de página (blanco). */
  page: '#ffffff',
  /** Texto principal (slate-900). */
  ink: '#0f172a',
  /** Texto secundario (slate-600). */
  muted: '#475569',
  /** Botones y enlaces (blue-700). */
  primary: '#1d4ed8',
  /** Encabezados (blue-800). */
  heading: '#1e40af',
  /** Fondo del elemento activo (blue-50). */
  active: '#eff6ff',
  /** Botón de acción destructiva (red-700). */
  danger: '#b91c1c',
  /** Bordes (slate-200). */
  border: '#e2e8f0',
} as const;

export type StatusTone = 'success' | 'info' | 'danger' | 'warning' | 'orange' | 'purple' | 'neutral';

/** Tonos de las insignias de estado: fondo claro (100) y texto oscuro (800). */
export const STATUS_TONES: Readonly<Record<StatusTone, { bg: string; fg: string }>> = {
  success: { bg: '#dcfce7', fg: '#166534' },
  info: { bg: '#dbeafe', fg: '#1e40af' },
  danger: { bg: '#fee2e2', fg: '#991b1b' },
  warning: { bg: '#fef3c7', fg: '#92400e' },
  orange: { bg: '#ffedd5', fg: '#9a3412' },
  purple: { bg: '#f3e8ff', fg: '#6b21a8' },
  neutral: { bg: '#f1f5f9', fg: '#334155' },
};

export const EVENT_TYPES = ['general', 'actividad', 'entrega', 'cumpleaños', 'agenda individual', 'día inhábil', 'feriado'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/**
 * Colores de los siete Tipos_de_Evento (mismos valores que el Backend). Se usan como marca de color junto
 * a un texto en `ink` sobre blanco, nunca como fondo de texto.
 */
export const EVENT_COLORS: Readonly<Record<EventType, string>> = {
  general: '#2563eb',
  actividad: '#16a34a',
  entrega: '#ea580c',
  cumpleaños: '#db2777',
  'agenda individual': '#7c3aed',
  'día inhábil': '#6b7280',
  feriado: '#991b1b',
};

/** Clase de fondo de la marca de color de cada Tipo_de_Evento (tema `event.e1` … `event.e7`). */
export const EVENT_COLOR_CLASSES: Readonly<Record<EventType, string>> = {
  general: 'bg-event-e1',
  actividad: 'bg-event-e2',
  entrega: 'bg-event-e3',
  cumpleaños: 'bg-event-e4',
  'agenda individual': 'bg-event-e5',
  'día inhábil': 'bg-event-e6',
  feriado: 'bg-event-e7',
};

/** Pares (texto, fondo) que usa la interfaz; todos deben tener contraste ≥ 4.5:1 (Property 44). */
export const TEXT_COLOR_PAIRS: ReadonlyArray<{ name: string; fg: string; bg: string }> = [
  { name: 'texto principal sobre blanco', fg: BASE_COLORS.ink, bg: BASE_COLORS.page },
  { name: 'texto secundario sobre blanco', fg: BASE_COLORS.muted, bg: BASE_COLORS.page },
  { name: 'encabezado sobre blanco', fg: BASE_COLORS.heading, bg: BASE_COLORS.page },
  { name: 'enlace sobre blanco', fg: BASE_COLORS.primary, bg: BASE_COLORS.page },
  { name: 'texto de botón principal', fg: BASE_COLORS.page, bg: BASE_COLORS.primary },
  { name: 'texto de botón de peligro', fg: BASE_COLORS.page, bg: BASE_COLORS.danger },
  { name: 'elemento activo', fg: BASE_COLORS.heading, bg: BASE_COLORS.active },
  { name: 'texto principal sobre elemento activo', fg: BASE_COLORS.ink, bg: BASE_COLORS.active },
  ...(Object.entries(STATUS_TONES) as [StatusTone, { bg: string; fg: string }][]).map(([tone, c]) => ({
    name: `insignia ${tone}`,
    fg: c.fg,
    bg: c.bg,
  })),
];

/** Tono de cada valor de estado (diseño "Colores de estado"). Los valores desconocidos usan `neutral`. */
const TONE_BY_STATUS: Readonly<Record<string, StatusTone>> = {
  activo: 'success',
  disponible: 'success',
  recibida: 'success',
  realizado: 'success',
  'dado de alta': 'info',
  programado: 'info',
  programada: 'info',
  fallecido: 'danger',
  'fuera de servicio': 'danger',
  agotado: 'danger',
  'stock bajo': 'danger',
  cancelado: 'danger',
  cancelada: 'danger',
  'en mantenimiento': 'warning',
  'en uso': 'warning',
  ocupada: 'orange',
  controlado: 'purple',
};

export function statusTone(value: string): StatusTone {
  return TONE_BY_STATUS[value.trim().toLowerCase()] ?? 'neutral';
}

/** Clases de Tailwind de cada tono (generadas desde el tema de tailwind.config.ts). */
export const STATUS_TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  success: 'bg-status-success-bg text-status-success-fg',
  info: 'bg-status-info-bg text-status-info-fg',
  danger: 'bg-status-danger-bg text-status-danger-fg',
  warning: 'bg-status-warning-bg text-status-warning-fg',
  orange: 'bg-status-orange-bg text-status-orange-fg',
  purple: 'bg-status-purple-bg text-status-purple-fg',
  neutral: 'bg-status-neutral-bg text-status-neutral-fg',
};

/** Colores del tema de Tailwind, generados desde las constantes anteriores. */
export function tailwindThemeColors() {
  const status = Object.fromEntries(Object.entries(STATUS_TONES).map(([tone, c]) => [tone, { bg: c.bg, fg: c.fg }]));
  const event = Object.fromEntries(EVENT_TYPES.map((type, i) => [`e${i + 1}`, EVENT_COLORS[type]]));
  return { ...BASE_COLORS, status, event };
}
