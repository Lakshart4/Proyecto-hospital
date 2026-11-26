import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { MESSAGES } from '../lib/messages';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** Diálogo modal accesible: título, cierre con Escape o con el botón "Cerrar" y transición de 200 ms (Req. 15.9). */
export function Modal({ open, title, onClose, children, footer }: ModalProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm transition-opacity duration-200 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/20 bg-page shadow-2xl transition-transform duration-200 focus:outline-none sm:max-h-[calc(100vh-2rem)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
          <h2 id={titleId} className="text-lg font-semibold text-heading">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={MESSAGES.common.close} className="rounded p-1 text-muted hover:bg-active hover:text-ink">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 text-sm text-ink">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
