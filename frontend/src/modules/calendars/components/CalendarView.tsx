import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '../../../shared/components/Button';
import {
  calendarTitle,
  getCalendarDays,
  moveAnchor,
  naturalDateOf,
  shortNaturalDate,
  todayNaturalDate,
} from '../dateUtils';
import type { CalendarItem, CalendarViewMode } from '../types';

export interface CalendarViewProps {
  items: readonly CalendarItem[];
  view: CalendarViewMode;
  anchorDate: string;
  onViewChange: (view: CalendarViewMode) => void;
  onAnchorChange: (date: string) => void;
  onSelect: (item: CalendarItem) => void;
  emptyMessage?: string;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function occursOn(item: CalendarItem, day: string): boolean {
  const start = item.date ?? naturalDateOf(item.start);
  const end = item.allDay ? start : naturalDateOf(item.end);
  return start !== '' && end !== '' && start <= day && end >= day;
}

export function CalendarView({
  items,
  view,
  anchorDate,
  onViewChange,
  onAnchorChange,
  onSelect,
  emptyMessage = 'No hay eventos en este periodo.',
}: CalendarViewProps) {
  const days = useMemo(() => getCalendarDays(anchorDate, view), [anchorDate, view]);
  const today = todayNaturalDate();
  const visibleItems = useMemo(
    () => items.filter((item) => days.some((day) => occursOn(item, day))),
    [days, items],
  );

  const itemsForDay = (day: string) =>
    visibleItems
      .filter((item) => occursOn(item, day))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

  return (
    <section aria-label={`Calendario en vista de ${view === 'month' ? 'mes' : 'semana'}`} className="overflow-hidden rounded-lg border border-border bg-page">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3 py-3 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" className="px-3" onClick={() => onAnchorChange(todayNaturalDate())}>
            Hoy
          </Button>
          <div className="flex items-center">
            <button
              type="button"
              aria-label={view === 'month' ? 'Mes anterior' : 'Semana anterior'}
              onClick={() => onAnchorChange(moveAnchor(anchorDate, view, -1))}
              className="rounded-md p-2 text-muted hover:bg-active hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronLeft aria-hidden="true" className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label={view === 'month' ? 'Mes siguiente' : 'Semana siguiente'}
              onClick={() => onAnchorChange(moveAnchor(anchorDate, view, 1))}
              className="rounded-md p-2 text-muted hover:bg-active hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ChevronRight aria-hidden="true" className="h-5 w-5" />
            </button>
          </div>
          <h2 className="min-w-0 text-base font-semibold text-heading sm:text-lg">{calendarTitle(anchorDate, view)}</h2>
        </div>
        <div aria-label="Vista del calendario" className="flex rounded-md border border-border p-0.5">
          {(['month', 'week'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={view === mode}
              onClick={() => onViewChange(mode)}
              className={`rounded px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                view === mode ? 'bg-primary text-page' : 'text-muted hover:bg-active hover:text-ink'
              }`}
            >
              {mode === 'month' ? 'Mes' : 'Semana'}
            </button>
          ))}
        </div>
      </div>

      {visibleItems.length === 0 && (
        <div role="status" className="flex items-center justify-center gap-2 border-b border-border px-4 py-6 text-sm text-muted">
          <CalendarDays aria-hidden="true" className="h-5 w-5" />
          <span>{emptyMessage}</span>
        </div>
      )}

      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="grid grid-cols-7 border-b border-border bg-active/50">
            {WEEKDAYS.map((weekday, index) => (
              <div key={weekday} className="border-r border-border px-2 py-2 text-center text-xs font-semibold text-muted last:border-r-0">
                <span className="sm:hidden">{weekday.charAt(0)}</span>
                <span className="hidden sm:inline">{weekday}</span>
                {view === 'week' && <span className="ml-1 font-normal">{shortNaturalDate(days[index])}</span>}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day, index) => {
              const outsideMonth = view === 'month' && day.slice(0, 7) !== anchorDate.slice(0, 7);
              const isToday = day === today;
              const dayNumber = Number(day.slice(8, 10));
              return (
                <div
                  key={day}
                  className={`min-h-[7.5rem] border-b border-r border-border p-1.5 last:border-r-0 sm:min-h-[9rem] sm:p-2 ${
                    view === 'week' ? 'min-h-[18rem]' : ''
                  } ${outsideMonth ? 'bg-active/30 text-muted' : 'bg-page'} ${index >= days.length - 7 ? 'border-b-0' : ''}`}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      aria-label={isToday ? `Hoy, ${dayNumber}` : String(dayNumber)}
                      className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-medium ${
                        isToday ? 'bg-primary text-page' : outsideMonth ? 'text-muted' : 'text-ink'
                      }`}
                    >
                      {dayNumber}
                    </span>
                  </div>
                  <div className={`flex flex-col gap-1 overflow-y-auto ${view === 'week' ? 'max-h-[15rem]' : 'max-h-24 sm:max-h-28'}`}>
                    {itemsForDay(day).map((item) => (
                      <button
                        key={`${day}:${item.id}`}
                        type="button"
                        title={item.title}
                        onClick={() => onSelect(item)}
                        className="w-full rounded border-l-4 bg-active/60 px-1.5 py-1 text-left text-xs text-ink transition-colors hover:bg-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        style={{ borderLeftColor: item.color }}
                      >
                        <span className="flex items-start gap-1">
                          <span aria-hidden="true" className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                          <span className="line-clamp-2 break-words">{item.title}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
