import { useCallback, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { readRedirectState } from '../../app/navigation';
import { useAuth } from '../hooks/useAuth';
import { MESSAGES } from '../lib/messages';
import { Sidebar } from './Sidebar';
import { Toast } from './Toast';
import { Topbar } from './Topbar';

const NOTICE_DURATION_MS = 5000;

/**
 * Estructura de las páginas con Sesión (Req. 15.3, 15.4, 15.10): menú lateral, barra superior y contenido.
 * El contenido usa `min-w-0` para que nada amplíe la página a lo ancho: las tablas desplazan su propio
 * contenedor (`overflow-x-auto` en DataTable). Con un cambio de contraseña pendiente no se muestra el menú.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [dismissedNotice, setDismissedNotice] = useState<string | null>(null);

  const closeMenu = useCallback((restoreFocus: boolean) => {
    setMenuOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }, []);
  const toggleMenu = useCallback(() => setMenuOpen((open) => !open), []);
  const dismissNotice = useCallback(() => setDismissedNotice(location.key), [location.key]);

  if (user === null) return null; // ProtectedRoute ya redirige a /login.

  const restricted = user.mustChangePassword;
  const accessDenied = readRedirectState(location.state).accessDenied === true && dismissedNotice !== location.key;

  return (
    <div className="flex min-h-screen w-full bg-page text-ink">
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-page"
      >
        {MESSAGES.layout.skipToContent}
      </a>
      {!restricted && <Sidebar role={user.role} open={menuOpen} onClose={closeMenu} />}
      <div data-testid="layout-content" className="flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          menuOpen={menuOpen}
          onToggleMenu={toggleMenu}
          showMenuButton={!restricted}
          onLogout={logout}
          menuButtonRef={menuButtonRef}
        />
        <main id="contenido" tabIndex={-1} className="min-w-0 flex-1 break-words p-4 focus:outline-none md:p-6">
          <Outlet />
        </main>
      </div>
      {accessDenied && <Toast message={MESSAGES.nav.accessDenied} tone="danger" durationMs={NOTICE_DURATION_MS} onClose={dismissNotice} />}
    </div>
  );
}
