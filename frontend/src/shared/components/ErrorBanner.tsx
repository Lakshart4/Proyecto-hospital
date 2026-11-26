import { AlertCircle } from 'lucide-react';
import { MESSAGES } from '../lib/messages';

export interface ErrorBannerProps {
  /** Mensaje en español (por ejemplo, el de la API); el formulario no se borra (Req. 15.12). */
  message: string;
  title?: string;
  onDismiss?: () => void;
}

/** Error visible y anunciado a lectores de pantalla. */
export function ErrorBanner({ message, title = MESSAGES.common.errorTitle, onDismiss }: ErrorBannerProps) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-status-danger-fg/30 bg-status-danger-bg px-4 py-3 text-sm text-status-danger-fg">
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">{title}</p>
        <p>{message}</p>
      </div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} className="text-sm font-medium underline">
          {MESSAGES.common.dismiss}
        </button>
      )}
    </div>
  );
}
