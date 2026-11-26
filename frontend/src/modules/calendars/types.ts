export type CalendarTab = 'general' | 'activities' | 'birthdays' | 'shifts' | 'agenda';
export type CalendarViewMode = 'month' | 'week';
export type StoredEventType = 'general' | 'actividad' | 'entrega';
export type EventType = StoredEventType | 'cumpleaños' | 'agenda individual' | 'día inhábil' | 'feriado';
export type CalendarSource = 'event' | 'delivery' | 'birthday' | 'nonWorkingDay' | 'holiday';
export type Shift = 'matutino' | 'vespertino';

export interface DeliveryDetails {
  status: 'programada' | 'recibida' | 'cancelada';
  supplierName: string;
  productName: string;
  quantityRequested: number;
}

export interface TreatmentDetails {
  id: number;
  type: string;
  description: string;
  patient: {
    id: number;
    internalId: string;
    firstName: string;
    lastName: string;
  };
}

export interface CalendarItem {
  id: string;
  source: CalendarSource | 'shift' | 'schedule' | 'treatment';
  type: EventType | 'turno' | 'horario';
  title: string;
  color: string;
  allDay: boolean;
  date?: string;
  start: string;
  end: string;
  description?: string | null;
  delivery?: DeliveryDetails;
  treatment?: TreatmentDetails;
  shift?: Shift;
}

export interface EventPayload {
  title: string;
  description?: string;
  type: StoredEventType;
  startAt: string;
  endAt: string;
}

export interface PersonalEventPayload {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
}

export interface NonWorkingDay {
  id: number;
  date: string;
  title: string;
  description: string;
  createdById: number;
}

export interface NonWorkingDayPayload {
  title: string;
  description: string;
  date: string;
}

export interface EmployeeOption {
  id: number;
  name: string;
  active: boolean;
  role: 'DOCTOR' | 'NURSE' | 'CLEANING';
}

export interface ShiftEntry {
  userId: number;
  name: string;
  startTime: string;
  endTime: string;
  startAt: string;
  endAt: string;
}

export interface ShiftDay {
  date: string;
  dayOfWeek: number;
  shifts: Partial<Record<Shift, ShiftEntry[]>>;
}

export interface ScheduleSlot {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface AgendaTreatment {
  id: number;
  type: string;
  status: 'programado';
  scheduledAt: string;
  description: string;
  patient: TreatmentDetails['patient'];
}

export interface AgendaData {
  userId: number;
  schedule: ScheduleSlot[];
  events: CalendarItem[];
  treatments: AgendaTreatment[];
}

export interface Holiday {
  date: string;
  name: string;
}

export interface HolidaysResult {
  available: boolean;
  data: Holiday[];
}

export const EVENT_COLORS: Readonly<Record<EventType, string>> = {
  general: '#2563eb',
  actividad: '#16a34a',
  entrega: '#ea580c',
  cumpleaños: '#db2777',
  'agenda individual': '#7c3aed',
  'día inhábil': '#6b7280',
  feriado: '#991b1b',
};

export const EVENT_TYPE_LABELS: Readonly<Record<EventType, string>> = {
  general: 'General',
  actividad: 'Actividad',
  entrega: 'Entrega',
  cumpleaños: 'Cumpleaños',
  'agenda individual': 'Agenda individual',
  'día inhábil': 'Día inhábil',
  feriado: 'Feriado',
};
