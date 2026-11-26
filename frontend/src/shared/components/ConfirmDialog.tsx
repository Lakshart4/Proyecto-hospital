import type { ReactNode } from 'react';
import { MESSAGES } from '../lib/messages';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  /** Solo se ejecuta al pulsar "Confirmar" (Req. 15.13). */
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  destructive?: boolean;
}

/** Confirmación antes de una acción irreversible, con "Confirmar" y "Cancelar" (Req. 15.13). */
export function ConfirmDialog({
  open,
  message,
  title = MESSAGES.confirmDialog.defaultTitle,
  confirmLabel = MESSAGES.common.confirm,
  onConfirm,
  onCancel,
  loading = false,
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            {MESSAGES.common.cancel}
          </Button>
          <Button variant={destructive ? 'danger' : 'primary'} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {message}
    </Modal>
  );
}
