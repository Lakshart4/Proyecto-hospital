import { X } from 'lucide-react';
import { useEffect } from 'react';
import { STATUS_TONE_CLASSES } from '../lib/colors';
import { MESSAGES } from '../lib/messages';

export interface ToastProps {
  message: string;
  tone?: 'success' | 'info' | 'danger';
  onClose: () => void;
  /** Cierre automático en milisegundos; sin valor, permanece hasta cerrarlo. */
  durationMs?: number;
}

/** Aviso breve y no bloqueante con transición de 200 ms. */
export function Toast({ message, tone = 'success', onClose, durationMs }: ToastProps) {
  useEffect(() => {
    if (durationMs === undefined) return;
    const timer = setTimeout(onClose, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onClose]);

  return (
    <div role="status" aria-live="polite" className={`fixed bottom-4 right-4 z-50 flex max-w-sm items-start gap-3 rounded-md px-4 py-3 text-sm shadow-lg transition-opacity duration-200 ${STATUS_TONE_CLASSES[tone]}`}>
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onClose} aria-label={MESSAGES.common.close} className="rounded p-0.5 hover:opacity-80">
        <X aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}
