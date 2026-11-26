import { Link } from 'react-router-dom';
import { Button } from '../../../shared/components/Button';
import { ProgressBar } from '../../../shared/components/ProgressBar';
import { StatusBadge } from '../../../shared/components/StatusBadge';
import { formatDateTime } from '../../../shared/lib/formatters';
import type { Room, RoomPatient } from '../types';

export interface RoomCardProps {
  room: Room;
  onAssign: (room: Room) => void;
  onRelease: (room: Room, patient: RoomPatient) => void;
  onEdit: (room: Room) => void;
  onDelete: (room: Room) => void;
}

export function RoomCard({ room, onAssign, onRelease, onEdit, onDelete }: RoomCardProps) {
  const occupied = room.availability === 'ocupada';
  return (
    <article className="flex flex-col gap-4 rounded-lg border border-border bg-page p-4 shadow-sm" aria-label={`Habitación ${room.number}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-heading">Habitación {room.number}</h3>
          <p className="text-sm text-muted">{room.department.name}</p>
        </div>
        <StatusBadge value={occupied ? 'Ocupada' : 'Disponible'} tone={occupied ? 'danger' : 'success'} />
      </div>
      <ProgressBar label={`Ocupación: ${room.activeCount} de ${room.capacity} pacientes`} value={(room.activeCount / room.capacity) * 100} />
      <div className="flex-1">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Pacientes asignados</h4>
        {room.patients.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Sin pacientes asignados.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {room.patients.map((patient) => (
              <li key={patient.assignmentId} className="rounded-md bg-active p-3">
                <Link to={`/pacientes/${patient.patientId}`} className="text-sm font-medium text-primary hover:underline">{patient.firstName} {patient.lastName}</Link>
                <p className="mt-1 text-xs text-muted">{patient.internalId} · Desde {formatDateTime(patient.startedAt)}</p>
                <Button variant="secondary" className="mt-2 px-3 py-1 text-xs" onClick={() => onRelease(room, patient)}>Liberar</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button className="px-3 py-1.5 text-xs" disabled={occupied} onClick={() => onAssign(room)}>{occupied ? 'Sin cupo' : 'Asignar paciente'}</Button>
        <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => onEdit(room)}>Editar</Button>
        <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => onDelete(room)}>Eliminar</Button>
      </div>
    </article>
  );
}
