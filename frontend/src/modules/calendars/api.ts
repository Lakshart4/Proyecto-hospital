import { apiClient } from '../../shared/lib/apiClient';
import type {
  AgendaData,
  CalendarItem,
  EmployeeOption,
  EventPayload,
  HolidaysResult,
  NonWorkingDay,
  NonWorkingDayPayload,
  PersonalEventPayload,
  ShiftDay,
} from './types';

const options = (signal?: AbortSignal) => (signal ? { signal } : {});
const rangeQuery = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

export async function getGeneralCalendar(from: string, to: string, signal?: AbortSignal): Promise<CalendarItem[]> {
  const response = await apiClient.get<{ data: CalendarItem[] }>(`/calendars/general?${rangeQuery(from, to)}`, options(signal));
  return response.data;
}

export async function getActivitiesCalendar(from: string, to: string, signal?: AbortSignal): Promise<CalendarItem[]> {
  const response = await apiClient.get<{ data: CalendarItem[] }>(`/calendars/activities?${rangeQuery(from, to)}`, options(signal));
  return response.data;
}

export async function getBirthdays(year: number, signal?: AbortSignal): Promise<CalendarItem[]> {
  const response = await apiClient.get<{ data: CalendarItem[] }>(`/calendars/birthdays?year=${year}`, options(signal));
  return response.data;
}

export async function getShifts(from: string, to: string, signal?: AbortSignal): Promise<ShiftDay[]> {
  const response = await apiClient.get<{ data: ShiftDay[] }>(`/calendars/shifts?${rangeQuery(from, to)}`, options(signal));
  return response.data;
}

export async function getAgenda(from: string, to: string, userId?: number, signal?: AbortSignal): Promise<AgendaData> {
  const owner = userId === undefined ? '' : `&userId=${userId}`;
  const response = await apiClient.get<{ data: AgendaData }>(`/calendars/agenda?${rangeQuery(from, to)}${owner}`, options(signal));
  return response.data;
}

export async function listEmployees(signal?: AbortSignal): Promise<EmployeeOption[]> {
  const response = await apiClient.get<{ data: EmployeeOption[] }>('/staff', options(signal));
  return response.data;
}

export async function createEvent(payload: EventPayload): Promise<void> {
  await apiClient.post('/events', payload);
}

export async function updateEvent(id: number, payload: EventPayload): Promise<void> {
  await apiClient.put(`/events/${id}`, payload);
}

export async function deleteEvent(id: number): Promise<void> {
  await apiClient.delete(`/events/${id}`);
}

export async function createPersonalEvent(payload: PersonalEventPayload): Promise<void> {
  await apiClient.post('/events/personal', payload);
}

export async function updatePersonalEvent(id: number, payload: PersonalEventPayload): Promise<void> {
  await apiClient.put(`/events/personal/${id}`, payload);
}

export async function deletePersonalEvent(id: number): Promise<void> {
  await apiClient.delete(`/events/personal/${id}`);
}

export async function listNonWorkingDays(signal?: AbortSignal): Promise<NonWorkingDay[]> {
  const response = await apiClient.get<{ data: NonWorkingDay[] }>('/non-working-days', options(signal));
  return response.data;
}

export async function createNonWorkingDay(payload: NonWorkingDayPayload): Promise<void> {
  await apiClient.post('/non-working-days', payload);
}

export async function updateNonWorkingDay(id: number, payload: NonWorkingDayPayload): Promise<void> {
  await apiClient.put(`/non-working-days/${id}`, payload);
}

export async function deleteNonWorkingDay(id: number): Promise<void> {
  await apiClient.delete(`/non-working-days/${id}`);
}

export async function getHolidays(year: number, signal?: AbortSignal): Promise<HolidaysResult> {
  return apiClient.get<HolidaysResult>(`/holidays?year=${year}`, options(signal));
}
