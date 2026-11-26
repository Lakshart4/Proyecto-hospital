import { LogOut, Menu } from 'lucide-react';
import { useRef, useState, type Ref } from 'react';
import type { AuthUser } from '../hooks/useAuth';
import { MESSAGES } from '../lib/messages';
import { Avatar } from './Avatar';
import { SIDEBAR_ID } from './Sidebar';
import { Spinner } from './Spinner';

export interface TopbarProps {
  user: AuthUser;
  menuOpen: boolean;
  onToggleMenu: () => void;
  /** Sin menú (por ejemplo, con un cambio de contraseña pendiente) no se muestra el botón de menú. */
  showMenuButton: boolean;
  onLogout: () => Promise<void>;
  menuButtonRef?: Ref<HTMLButtonElement>;
}

/**
 * Barra superior: botón de menú (< 768 px), nombre del sistema, foto, nombre y rol del usuario y
 * "Cerrar sesión" (Req. 15.3, 15.8). La foto es la imagen por defecto: `/auth/me` no devuelve foto;
 * la foto real del Perfil se integra en la Etapa 6.
 */
export function Topbar({ user, menuOpen, onToggleMenu, showMenuButton, onLogout, menuButtonRef }: TopbarProps) {
  const [loggingOut, setLoggingOut] = useState(false);
  const busy = useRef(false);

  const handleLogout = () => {
    if (busy.current) return;
    busy.current = true;
    setLoggingOut(true);
    void onLogout().finally(() => {
      busy.current = false;
      setLoggingOut(false);
    });
  };

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-page px-3 sm:px-4 md:px-6">
      {showMenuButton && (
        <button
          ref={menuButtonRef}
          type="button"
          onClick={onToggleMenu}
          aria-controls={SIDEBAR_ID}
          aria-expanded={menuOpen}
          aria-label={menuOpen ? MESSAGES.layout.closeMenu : MESSAGES.layout.openMenu}
          className="rounded-md p-2 text-ink hover:bg-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary md:hidden"
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
      )}
      <p className="hidden truncate text-base font-semibold text-heading sm:block">{MESSAGES.app.name}</p>
      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <Avatar size="sm" alt={MESSAGES.layout.userPhoto(user.name)} />
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs text-muted">{MESSAGES.roles[user.role]}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          aria-busy={loggingOut || undefined}
          aria-label={MESSAGES.layout.logout}
          title={MESSAGES.layout.logout}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border px-2 py-2 text-sm font-medium text-ink transition-colors duration-200 hover:bg-active focus:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60 sm:px-3"
        >
          {loggingOut ? <Spinner size="sm" /> : <LogOut aria-hidden="true" className="h-4 w-4" />}
          <span className="hidden sm:inline">{MESSAGES.layout.logout}</span>
        </button>
      </div>
    </header>
  );
}
