import { Hospital, ShieldCheck, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { menuFor } from '../../app/navigation';
import type { Role } from '../../app/permissions';
import { MESSAGES } from '../lib/messages';

export const SIDEBAR_ID = 'menu-lateral';

export interface SidebarProps {
  role: Role;
  /** Panel abierto en móvil (< 768 px). Desde 768 px el menú siempre está visible. */
  open: boolean;
  /** Cierra el panel; `restoreFocus` devuelve el foco al botón de menú. */
  onClose: (restoreFocus: boolean) => void;
}

/**
 * Menú lateral con una entrada por sección permitida al rol (Req. 2.8, 15.3, 15.4, 15.6, 15.9):
 * - ≥ 1280 px: fijo de 256 px (`xl:w-64`) con ícono y texto.
 * - 768 a 1279 px: fijo compacto (`md:w-20`), solo íconos; el texto queda para lectores de pantalla y en `title`.
 * - < 768 px: oculto por defecto; se abre como panel desplegable sobre el contenido. Cerrado queda
 *   `invisible`, así sus enlaces no reciben el foco. Se cierra con Escape, el fondo o el botón "Cerrar menú".
 */
export function Sidebar({ role, open, onClose }: SidebarProps) {
  const items = menuFor(role);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          data-testid="menu-overlay"
          aria-hidden="true"
          onClick={() => onClose(true)}
          className="fixed inset-0 z-30 bg-ink/50 transition-opacity duration-200 md:hidden"
        />
      )}
      <aside
        id={SIDEBAR_ID}
        data-open={open}
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-border bg-page shadow-2xl transition-transform duration-200 md:visible md:sticky md:top-0 md:h-screen md:w-20 md:translate-x-0 md:shadow-none xl:w-64 ${
          open ? 'visible translate-x-0' : 'invisible -translate-x-full'
        }`}
      >
        <div className="flex h-20 items-center gap-3 border-b border-border bg-gradient-to-r from-heading to-primary px-4 text-white md:h-16 md:justify-center md:px-2 xl:h-20 xl:justify-start xl:px-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
            <Hospital aria-hidden="true" className="h-6 w-6 text-white" />
          </span>
          <span className="min-w-0 md:sr-only xl:not-sr-only">
            <span className="block truncate text-sm font-bold tracking-tight text-white">{MESSAGES.app.name}</span>
            <span className="mt-0.5 block text-xs font-medium text-white/85">Administración hospitalaria</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onClose(true)}
            aria-label={MESSAGES.layout.closeMenu}
            className="ml-auto rounded-lg p-1.5 text-white/85 transition-colors hover:bg-white/15 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white md:hidden"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>
        <nav aria-label={MESSAGES.nav.label} className="flex-1 overflow-y-auto px-3 py-5 md:px-2 xl:px-3">
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.id}>
                  <NavLink
                    to={item.path}
                    end={item.nested !== true}
                    title={item.label}
                    onClick={() => onClose(false)}
                    className={({ isActive }) =>
                      `flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm font-medium transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent md:justify-center md:px-0 xl:justify-start xl:px-3 ${
                        isActive ? 'border-primary bg-active font-semibold text-heading shadow-sm' : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-heading'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon aria-hidden="true" className={`h-5 w-5 shrink-0 ${isActive ? 'text-accent' : 'text-slate-500'}`} />
                        <span className="truncate md:sr-only xl:not-sr-only">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-border px-4 py-4 md:px-2 xl:px-4">
          <div className="flex items-center gap-2 text-xs text-muted md:justify-center xl:justify-start" title="Acceso limitado según tu rol">
            <ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-accent" />
            <span className="md:sr-only xl:not-sr-only">Acceso protegido por rol</span>
          </div>
        </div>
      </aside>
    </>
  );
}
