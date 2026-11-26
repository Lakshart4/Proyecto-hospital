import { AlertTriangle, CalendarDays, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../../shared/components/Button';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { ErrorBanner } from '../../../shared/components/ErrorBanner';
import { INPUT_CLASSES } from '../../../shared/components/FormField';
import { Spinner } from '../../../shared/components/Spinner';
import { Tabs, type TabItem } from '../../../shared/components/Tabs';
import { Toast } from '../../../shared/components/Toast';
import { useApi } from '../../../shared/hooks/useApi';
import { useAuth } from '../../../shared/hooks/useAuth';
import { toApiError } from '../../../shared/lib/apiClient';
import {
  createEvent,
  createNonWorkingDay,
  createPersonalEvent,
  deleteEvent,
  deleteNonWorkingDay,
  deletePersonalEvent,
  getActivitiesCalendar,
  getAgenda,
  getBirthdays,
  getGeneralCalendar,
  getHolidays,
  getShifts,
  listEmployees,
  listNonWorkingDays,
  updateEvent,
  updateNonWorkingDay,
  updatePersonalEvent,
} from '../api';
import { CalendarItemDialog } from '../components/CalendarItemDialog';
import { CalendarLegend } from '../components/CalendarLegend';
import { CalendarView } from '../components/CalendarView';
import { EventFormModal } from '../components/EventFormModal';
import { NonWorkingDayFormModal } from '../components/NonWorkingDayFormModal';
import { NonWorkingDaysPanel } from '../components/NonWorkingDaysPanel';
import { getCalendarDays, hospitalDateTimeToIso, todayNaturalDate, yearsInDays } from '../dateUtils';
import {
  EVENT_COLORS,
  type AgendaData,
  type CalendarItem,
  type CalendarTab,
  type CalendarViewMode,
  type EventPayload,
  type NonWorkingDay,
  type NonWorkingDayPayload,
  type PersonalEventPayload,
  type StoredEventType,
} from '../types';

const TABS: readonly TabItem<CalendarTab>[] = [
  { id: 'general', label: 'General' },
  { id: 'activities', label: 'Actividades y entregas' },
  { id: 'birthdays', label: 'Cumpleaños' },
  { id: 'shifts', label: 'Turnos' },
  { id: 'agenda', label: 'Mi agenda' },
];

const EMPTY_MESSAGES: Readonly<Record<CalendarTab, string>> = {
  general: 'No hay eventos generales, entregas, días inhábiles ni feriados en este periodo.',
  activities: 'No hay actividades ni entregas en este periodo.',
  birthdays: 'No hay cumpleaños en este periodo.',
  shifts: 'No hay turnos con horario asignado en este periodo.',
  agenda: 'No hay horarios, eventos personales ni tratamientos en este periodo.',
};

interface EventEditorState {
  personal: boolean;
  defaultType: StoredEventType;
  item?: CalendarItem;
}

interface NonWorkingEditorState {
  item?: NonWorkingDay;
}

function storedEventId(item: CalendarItem): number {
  return Number(item.id.slice(item.id.indexOf(':') + 1));
}

function nonWorkingDayFromItem(item: CalendarItem, days: readonly NonWorkingDay[]): NonWorkingDay {
  const id = storedEventId(item);
  return days.find((day) => day.id === id) ?? {
    id,
    date: item.date ?? item.start.slice(0, 10),
    title: item.title,
    description: item.description ?? '',
    createdById: 0,
  };
}

function agendaItems(data: AgendaData, days: readonly string[]): CalendarItem[] {
  const schedule = days.flatMap((date) => {
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    return data.schedule
      .filter((slot) => slot.dayOfWeek === weekday)
      .map((slot): CalendarItem => ({
        id: `schedule:${data.userId}:${date}:${slot.startTime}`,
        source: 'schedule',
        type: 'horario',
        title: 'Horario de trabajo',
        color: '#6b7280',
        allDay: false,
        start: hospitalDateTimeToIso(`${date}T${slot.startTime}`),
        end: hospitalDateTimeToIso(`${date}T${slot.endTime}`),
      }));
  });
  const treatments = data.treatments.map((treatment): CalendarItem => ({
    id: `treatment:${treatment.id}`,
    source: 'treatment',
    type: 'actividad',
    title: `Tratamiento: ${treatment.patient.firstName} ${treatment.patient.lastName}`,
    color: EVENT_COLORS.actividad,
    allDay: false,
    start: treatment.scheduledAt,
    end: treatment.scheduledAt,
    treatment: {
      id: treatment.id,
      type: treatment.type,
      description: treatment.description,
      patient: treatment.patient,
    },
  }));
  return [...schedule, ...data.events, ...treatments];
}

export function CalendarsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';
  const [tab, setTab] = useState<CalendarTab>('general');
  const [view, setView] = useState<CalendarViewMode>('month');
  const [anchorDate, setAnchorDate] = useState(todayNaturalDate);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [details, setDetails] = useState<CalendarItem | null>(null);
  const [eventEditor, setEventEditor] = useState<EventEditorState | null>(null);
  const [deleteEventTarget, setDeleteEventTarget] = useState<CalendarItem | null>(null);
  const [nonWorkingEditor, setNonWorkingEditor] = useState<NonWorkingEditorState | null>(null);
  const [deleteNonWorkingTarget, setDeleteNonWorkingTarget] = useState<NonWorkingDay | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const days = useMemo(() => getCalendarDays(anchorDate, view), [anchorDate, view]);
  const from = days[0];
  const to = days[days.length - 1];
  const years = yearsInDays(days);
  const rangeKey = `${from}:${to}`;

  const generalQuery = useApi((signal) => getGeneralCalendar(from, to, signal), [from, to], { enabled: tab === 'general' });
  const activitiesQuery = useApi((signal) => getActivitiesCalendar(from, to, signal), [from, to], { enabled: tab === 'activities' });
  const birthdaysQuery = useApi(
    async (signal) => (await Promise.all(years.map((year) => getBirthdays(year, signal)))).flat(),
    [rangeKey],
    { enabled: tab === 'birthdays' },
  );
  const shiftsQuery = useApi((signal) => getShifts(from, to, signal), [from, to], { enabled: tab === 'shifts' });
  const employeesQuery = useApi((signal) => listEmployees(signal), [], { enabled: isAdmin && tab === 'agenda' });
  const nonWorkingQuery = useApi((signal) => listNonWorkingDays(signal), [], { enabled: tab === 'general' });
  const holidaysQuery = useApi(
    (signal) => Promise.all(years.map((year) => getHolidays(year, signal))),
    [rangeKey],
    { enabled: tab === 'general' },
  );

  const employees = useMemo(() => (employeesQuery.data ?? []).filter((employee) => employee.active), [employeesQuery.data]);
  const selectedAgendaId = isAdmin
    ? employees.some((employee) => employee.id === selectedEmployeeId) ? selectedEmployeeId ?? undefined : employees[0]?.id
    : user?.id;
  const agendaQuery = useApi(
    (signal) => getAgenda(from, to, isAdmin ? selectedAgendaId : undefined, signal),
    [from, to, selectedAgendaId ?? 0, isAdmin],
    { enabled: tab === 'agenda' && user !== null && (!isAdmin || selectedAgendaId !== undefined) },
  );

  const items = useMemo<CalendarItem[]>(() => {
    if (tab === 'general') return generalQuery.data ?? [];
    if (tab === 'activities') return activitiesQuery.data ?? [];
    if (tab === 'birthdays') return birthdaysQuery.data ?? [];
    if (tab === 'shifts') {
      return (shiftsQuery.data ?? []).flatMap((day) =>
        (['matutino', 'vespertino'] as const).flatMap((shift) =>
          (day.shifts[shift] ?? []).map((entry): CalendarItem => ({
            id: `shift:${day.date}:${shift}:${entry.userId}`,
            source: 'shift',
            type: 'turno',
            title: `${entry.name} · Turno ${shift}`,
            color: shift === 'matutino' ? EVENT_COLORS.general : EVENT_COLORS.actividad,
            allDay: false,
            date: day.date,
            start: entry.startAt,
            end: entry.endAt,
            shift,
          })),
        ),
      );
    }
    return agendaQuery.data ? agendaItems(agendaQuery.data, days) : [];
  }, [tab, generalQuery.data, activitiesQuery.data, birthdaysQuery.data, shiftsQuery.data, agendaQuery.data, days]);

  const currentLoading =
    tab === 'general' ? generalQuery.loading :
    tab === 'activities' ? activitiesQuery.loading :
    tab === 'birthdays' ? birthdaysQuery.loading :
    tab === 'shifts' ? shiftsQuery.loading :
    (isAdmin && employeesQuery.loading) || agendaQuery.loading;
  const currentError =
    tab === 'general' ? generalQuery.error :
    tab === 'activities' ? activitiesQuery.error :
    tab === 'birthdays' ? birthdaysQuery.error :
    tab === 'shifts' ? shiftsQuery.error :
    isAdmin && employeesQuery.error ? employeesQuery.error : agendaQuery.error;

  const retryCurrent = () => {
    if (tab === 'general') generalQuery.reload();
    else if (tab === 'activities') activitiesQuery.reload();
    else if (tab === 'birthdays') birthdaysQuery.reload();
    else if (tab === 'shifts') shiftsQuery.reload();
    else if (isAdmin && employeesQuery.error) employeesQuery.reload();
    else agendaQuery.reload();
  };

  const canCreatePersonal = tab === 'agenda' && !isAdmin && user !== null;
  const canCreateEvent = isAdmin && (tab === 'general' || tab === 'activities');
  const emptyMessage = tab === 'agenda' && isAdmin && employeesQuery.data !== null && employees.length === 0
    ? 'No hay empleados activos para consultar su agenda.'
    : EMPTY_MESSAGES[tab];

  const changeTab = (next: CalendarTab) => {
    setTab(next);
    setDetails(null);
    setActionError(null);
  };

  const canModifyItem = (item: CalendarItem): boolean => {
    if (item.source === 'nonWorkingDay') return isAdmin;
    if (item.source !== 'event') return false;
    if (item.type === 'agenda individual') return tab === 'agenda' && selectedAgendaId === user?.id;
    return isAdmin;
  };

  const editItem = (item: CalendarItem) => {
    setDetails(null);
    if (item.source === 'nonWorkingDay') {
      setNonWorkingEditor({ item: nonWorkingDayFromItem(item, nonWorkingQuery.data ?? []) });
      return;
    }
    if (item.source !== 'event') return;
    const personal = item.type === 'agenda individual';
    setEventEditor({
      personal,
      item,
      defaultType: !personal && (item.type === 'general' || item.type === 'actividad' || item.type === 'entrega') ? item.type : 'general',
    });
  };

  const requestDeleteItem = (item: CalendarItem) => {
    setDetails(null);
    setActionError(null);
    if (item.source === 'nonWorkingDay') setDeleteNonWorkingTarget(nonWorkingDayFromItem(item, nonWorkingQuery.data ?? []));
    else if (item.source === 'event') setDeleteEventTarget(item);
  };

  const saveEvent = async (payload: EventPayload | PersonalEventPayload) => {
    if (!eventEditor) return;
    setActionError(null);
    if (eventEditor.personal) {
      const personalPayload = payload as PersonalEventPayload;
      if (eventEditor.item) await updatePersonalEvent(storedEventId(eventEditor.item), personalPayload);
      else await createPersonalEvent(personalPayload);
      agendaQuery.reload();
    } else {
      const eventPayload = payload as EventPayload;
      if (eventEditor.item) await updateEvent(storedEventId(eventEditor.item), eventPayload);
      else await createEvent(eventPayload);
      generalQuery.reload();
      activitiesQuery.reload();
    }
    setEventEditor(null);
    setToast(eventEditor.item ? 'El evento se actualizó correctamente.' : 'El evento se creó correctamente.');
  };

  const confirmDeleteEvent = async () => {
    if (!deleteEventTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      const personal = deleteEventTarget.type === 'agenda individual';
      if (personal) await deletePersonalEvent(storedEventId(deleteEventTarget));
      else await deleteEvent(storedEventId(deleteEventTarget));
      if (personal) agendaQuery.reload();
      else {
        generalQuery.reload();
        activitiesQuery.reload();
      }
      setDeleteEventTarget(null);
      setToast('El evento se eliminó correctamente.');
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setDeleteEventTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const saveNonWorkingDay = async (payload: NonWorkingDayPayload) => {
    if (!nonWorkingEditor) return;
    if (nonWorkingEditor.item) await updateNonWorkingDay(nonWorkingEditor.item.id, payload);
    else await createNonWorkingDay(payload);
    nonWorkingQuery.reload();
    generalQuery.reload();
    setNonWorkingEditor(null);
    setToast(nonWorkingEditor.item ? 'El día inhábil se actualizó correctamente.' : 'El día inhábil se creó correctamente.');
  };

  const confirmDeleteNonWorkingDay = async () => {
    if (!deleteNonWorkingTarget || deleting) return;
    setDeleting(true);
    setActionError(null);
    try {
      await deleteNonWorkingDay(deleteNonWorkingTarget.id);
      nonWorkingQuery.reload();
      generalQuery.reload();
      setDeleteNonWorkingTarget(null);
      setToast('El día inhábil se eliminó correctamente.');
    } catch (reason) {
      setActionError(toApiError(reason).message);
      setDeleteNonWorkingTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const holidaysUnavailable = tab === 'general' && (holidaysQuery.error !== null || (holidaysQuery.data ?? []).some((result) => !result.available));

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-heading">
            <CalendarDays aria-hidden="true" className="h-7 w-7" />
            Calendarios
          </h1>
          <p className="mt-1 text-sm text-muted">Consulta la actividad institucional, los turnos y las agendas individuales.</p>
        </div>
        {(canCreateEvent || canCreatePersonal) && (
          <Button
            onClick={() => setEventEditor({
              personal: canCreatePersonal,
              defaultType: tab === 'activities' ? 'actividad' : 'general',
            })}
          >
            <Plus aria-hidden="true" className="h-4 w-4" />
            {canCreatePersonal ? 'Nuevo evento personal' : 'Nuevo evento'}
          </Button>
        )}
      </header>

      <Tabs tabs={TABS} active={tab} onChange={changeTab} label="Calendarios disponibles" />

      {tab === 'agenda' && (
        <section className="rounded-lg border border-border bg-page p-4" aria-label="Selección de agenda">
          {isAdmin ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="w-full max-w-md">
                <label htmlFor="agenda-employee" className="mb-1 block text-sm font-medium text-ink">Empleado</label>
                <select
                  id="agenda-employee"
                  className={INPUT_CLASSES}
                  value={selectedAgendaId ?? ''}
                  onChange={(event) => setSelectedEmployeeId(Number(event.target.value))}
                  disabled={employeesQuery.loading || employees.length === 0}
                >
                  {employees.length === 0 && <option value="">Sin empleados disponibles</option>}
                  {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </select>
              </div>
              <p className="pb-2 text-xs text-muted">Los eventos personales solo pueden ser modificados por su propietario.</p>
            </div>
          ) : (
            <p className="text-sm text-muted">Tu horario de trabajo, eventos personales y tratamientos programados.</p>
          )}
        </section>
      )}

      {holidaysUnavailable && (
        <div role="status" className="flex items-start gap-3 rounded-md border border-status-warning-fg/30 bg-status-warning-bg px-4 py-3 text-sm text-status-warning-fg">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Feriados no disponibles</p>
            <p>No se pudo consultar el servicio de feriados. El calendario sigue disponible y muestra el resto de los eventos.</p>
          </div>
          <Button variant="secondary" className="ml-auto shrink-0 px-3 py-1.5" onClick={holidaysQuery.reload}>Reintentar</Button>
        </div>
      )}

      {actionError && <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />}
      {currentError && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1"><ErrorBanner message={currentError.message} /></div>
          <Button variant="secondary" onClick={retryCurrent}>Reintentar</Button>
        </div>
      )}

      {currentLoading ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-lg border border-border bg-page text-sm text-muted">
          <Spinner />
          <span>Cargando calendario…</span>
        </div>
      ) : (
        <CalendarView
          items={currentError ? [] : items}
          view={view}
          anchorDate={anchorDate}
          onViewChange={setView}
          onAnchorChange={setAnchorDate}
          onSelect={setDetails}
          emptyMessage={currentError ? 'No se pudo cargar este calendario.' : emptyMessage}
        />
      )}

      <CalendarLegend />

      {tab === 'general' && (
        <NonWorkingDaysPanel
          days={nonWorkingQuery.data ?? []}
          loading={nonWorkingQuery.loading}
          error={nonWorkingQuery.error}
          isAdmin={isAdmin}
          onRetry={nonWorkingQuery.reload}
          onCreate={() => setNonWorkingEditor({})}
          onEdit={(item) => setNonWorkingEditor({ item })}
          onDelete={(item) => { setActionError(null); setDeleteNonWorkingTarget(item); }}
        />
      )}

      <CalendarItemDialog
        item={details}
        canEdit={details ? canModifyItem(details) : false}
        canDelete={details ? canModifyItem(details) : false}
        onClose={() => setDetails(null)}
        onEdit={editItem}
        onDelete={requestDeleteItem}
      />

      <EventFormModal
        open={eventEditor !== null}
        personal={eventEditor?.personal ?? false}
        anchorDate={anchorDate}
        defaultType={eventEditor?.defaultType ?? 'general'}
        initial={eventEditor?.item}
        onClose={() => setEventEditor(null)}
        onSubmit={saveEvent}
      />

      <NonWorkingDayFormModal
        open={nonWorkingEditor !== null}
        anchorDate={anchorDate}
        initial={nonWorkingEditor?.item}
        onClose={() => setNonWorkingEditor(null)}
        onSubmit={saveNonWorkingDay}
      />

      <ConfirmDialog
        open={deleteEventTarget !== null}
        title="Eliminar evento"
        message={deleteEventTarget ? `¿Deseas eliminar “${deleteEventTarget.title}”? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDeleteEvent()}
        onCancel={() => !deleting && setDeleteEventTarget(null)}
        loading={deleting}
      />

      <ConfirmDialog
        open={deleteNonWorkingTarget !== null}
        title="Eliminar día inhábil"
        message={deleteNonWorkingTarget ? `¿Deseas eliminar “${deleteNonWorkingTarget.title}”? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => void confirmDeleteNonWorkingDay()}
        onCancel={() => !deleting && setDeleteNonWorkingTarget(null)}
        loading={deleting}
      />

      {toast && <Toast message={toast} tone="success" onClose={() => setToast(null)} durationMs={5000} />}
    </div>
  );
}

export default CalendarsPage;
