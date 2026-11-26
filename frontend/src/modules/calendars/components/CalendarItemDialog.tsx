import { Pencil, Trash2 } from 'lucide-react';
import { Button } from '../../../shared/components/Button';
import { Modal } from '../../../shared/components/Modal';
import { formatDate, formatDateTime } from '../../../shared/lib/formatters';
import { naturalDateOf } from '../dateUtils';
import { EVENT_TYPE_LABELS, type CalendarItem } from '../types';

export interface CalendarItemDialogProps {
  item: CalendarItem | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (item: CalendarItem) => void;
  onDelete: (item: CalendarItem) => void;
}

function itemTypeLabel(item: CalendarItem): string {
  if (item.source === 'shift') return `Turno ${item.shift ?? ''}`.trim();
  if (item.source === 'schedule') return 'Horario de trabajo';
  if (item.source === 'treatment') return 'Tratamiento programado';
  if (item.type in EVENT_TYPE_LABELS) return EVENT_TYPE_LABELS[item.type as keyof typeof EVENT_TYPE_LABELS];
  return item.type;
}

export function CalendarItemDialog({ item, canEdit, canDelete, onClose, onEdit, onDelete }: CalendarItemDialogProps) {
  if (!item) return null;
  const startDay = item.date ?? naturalDateOf(item.start);
  const endDay = item.allDay ? startDay : naturalDateOf(item.end);
  const quantity = item.delivery ? new Intl.NumberFormat('es-MX').format(item.delivery.quantityRequested) : null;

  return (
    <Modal
      open
      title={item.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cerrar</Button>
          {canEdit && (
            <Button onClick={() => onEdit(item)}>
              <Pencil aria-hidden="true" className="h-4 w-4" />
              Editar
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={() => onDelete(item)}>
              <Trash2 aria-hidden="true" className="h-4 w-4" />
              Eliminar
            </Button>
          )}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ backgroundColor: item.color }} />
          <span className="font-medium text-heading">{itemTypeLabel(item)}</span>
        </div>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Inicio</dt>
            <dd className="mt-1">{item.allDay ? formatDate(startDay) : formatDateTime(item.start)}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-muted">Fin</dt>
            <dd className="mt-1">{item.allDay ? formatDate(endDay) : formatDateTime(item.end)}</dd>
          </div>
        </dl>
        {item.description && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Descripción</h3>
            <p className="mt-1 whitespace-pre-wrap">{item.description}</p>
          </div>
        )}
        {item.delivery && (
          <div className="rounded-md border border-border bg-active/40 p-3">
            <h3 className="mb-2 font-semibold text-heading">Datos de la entrega</h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Proveedor</dt><dd className="font-medium">{item.delivery.supplierName}</dd></div>
              <div><dt className="text-xs text-muted">Producto</dt><dd className="font-medium">{item.delivery.productName}</dd></div>
              <div><dt className="text-xs text-muted">Cantidad solicitada</dt><dd className="font-medium">{quantity}</dd></div>
              <div><dt className="text-xs text-muted">Estado</dt><dd className="font-medium capitalize">{item.delivery.status}</dd></div>
            </dl>
          </div>
        )}
        {item.treatment && (
          <div className="rounded-md border border-border bg-active/40 p-3">
            <h3 className="mb-2 font-semibold text-heading">Datos del tratamiento</h3>
            <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div><dt className="text-xs text-muted">Paciente</dt><dd className="font-medium">{item.treatment.patient.firstName} {item.treatment.patient.lastName}</dd></div>
              <div><dt className="text-xs text-muted">ID interno</dt><dd className="font-medium">{item.treatment.patient.internalId}</dd></div>
              <div><dt className="text-xs text-muted">Tipo</dt><dd className="font-medium capitalize">{item.treatment.type}</dd></div>
            </dl>
            {item.treatment.description && <p className="mt-2 whitespace-pre-wrap">{item.treatment.description}</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
