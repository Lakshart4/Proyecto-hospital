import { EVENT_COLORS, EVENT_TYPE_LABELS, type EventType } from '../types';

const LEGEND_TYPES: readonly EventType[] = [
  'general',
  'actividad',
  'entrega',
  'cumpleaños',
  'agenda individual',
  'día inhábil',
  'feriado',
];

export function CalendarLegend() {
  return (
    <section aria-label="Leyenda de colores" className="rounded-lg border border-border bg-page px-4 py-3">
      <h2 className="mb-2 text-sm font-semibold text-heading">Leyenda</h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {LEGEND_TYPES.map((type) => (
          <li key={type} className="flex items-center gap-2 text-xs text-ink sm:text-sm">
            <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: EVENT_COLORS[type] }} />
            <span>{EVENT_TYPE_LABELS[type]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
