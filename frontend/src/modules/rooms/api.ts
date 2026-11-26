import { apiClient } from '../../shared/lib/apiClient';
import type { Patient } from '../patients/types';
import type {
  OccupancyFilters,
  OccupancyPage,
  OccupancySummary,
  ReleaseReason,
  Room,
  RoomCounters,
  RoomDepartment,
  RoomFilters,
} from './types';

export interface RoomPayload {
  number: number;
  departmentId: number;
  capacity: number;
}

export interface ReleasePayload {
  patientId: number;
  reason: ReleaseReason;
  note?: string;
}

function queryString(values: Record<string, string | number | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && String(value).trim() !== '') params.set(key, String(value));
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

export async function listRooms(filters: RoomFilters = {}, signal?: AbortSignal): Promise<Room[]> {
  const query = queryString({ departmentId: filters.departmentId, availability: filters.availability || undefined });
  const response = await apiClient.get<{ data: Room[] }>(`/rooms${query}`, signal ? { signal } : {});
  return response.data;
}

export async function getRoomCounters(signal?: AbortSignal): Promise<RoomCounters> {
  const response = await apiClient.get<{ data: RoomCounters }>('/rooms/counters', signal ? { signal } : {});
  return response.data;
}

export async function getRoom(id: number, signal?: AbortSignal): Promise<Room> {
  const response = await apiClient.get<{ data: Room }>(`/rooms/${id}`, signal ? { signal } : {});
  return response.data;
}

export async function createRoom(payload: RoomPayload): Promise<void> {
  await apiClient.post('/rooms', payload);
}

export async function updateRoom(id: number, payload: RoomPayload): Promise<void> {
  await apiClient.put(`/rooms/${id}`, payload);
}

export async function deleteRoom(id: number): Promise<void> {
  await apiClient.delete(`/rooms/${id}`);
}

export async function assignPatientToRoom(roomId: number, patientId: number): Promise<void> {
  await apiClient.post(`/rooms/${roomId}/assignments`, { patientId });
}

export async function releasePatientFromRoom(roomId: number, payload: ReleasePayload): Promise<void> {
  await apiClient.post(`/rooms/${roomId}/releases`, payload);
}

export async function listOccupancyHistory(filters: OccupancyFilters = {}, signal?: AbortSignal): Promise<OccupancyPage> {
  const query = queryString({
    departmentId: filters.departmentId,
    roomId: filters.roomId,
    reason: filters.reason || undefined,
    from: filters.from,
    to: filters.to,
    page: filters.page,
    pageSize: filters.pageSize,
  });
  return apiClient.get<OccupancyPage>(`/occupancy-history${query}`, signal ? { signal } : {});
}

export async function getOccupancySummary(
  filters: Pick<OccupancyFilters, 'departmentId' | 'from' | 'to'> = {},
  signal?: AbortSignal,
): Promise<OccupancySummary[]> {
  const query = queryString({ departmentId: filters.departmentId, from: filters.from, to: filters.to });
  const response = await apiClient.get<{ data: OccupancySummary[] }>(`/occupancy-history/summary${query}`, signal ? { signal } : {});
  return response.data;
}

export async function listRoomDepartments(signal?: AbortSignal): Promise<RoomDepartment[]> {
  const response = await apiClient.get<{ data: RoomDepartment[] }>('/departments', signal ? { signal } : {});
  return response.data;
}

/** Pacientes activos para el selector de asignación; recorre la paginación del contrato REST. */
export async function listAssignablePatients(signal?: AbortSignal): Promise<Patient[]> {
  const pageSize = 100;
  const getPage = async (page: number) => {
    const query = queryString({ status: 'activo', page, pageSize });
    return apiClient.get<{ data: Patient[]; page: number; pageSize: number; total: number }>(
      `/patients${query}`,
      signal ? { signal } : {},
    );
  };
  const first = await getPage(1);
  const pageCount = Math.ceil(first.total / pageSize);
  const rest = await Promise.all(Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => getPage(index + 2)));
  return [first, ...rest].flatMap((page) => page.data);
}
