// Pruebas de Layout, Sidebar y Topbar (tarea 5.9). jsdom no calcula estilos ni tamaños: se comprueban las
// clases responsivas de Tailwind y el comportamiento (abrir, cerrar, foco, ruta activa), no anchos reales.

import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { menuFor } from '../../app/navigation';
import { ROLES } from '../../app/permissions';
import { MESSAGES } from '../lib/messages';
import { emptyResponse, makeUser, mockApi, renderApp, userReply } from '../../test/appHarness';
import { DEFAULT_AVATAR_SRC } from './Avatar';
import { SIDEBAR_ID } from './Sidebar';

afterEach(() => {
  vi.unstubAllGlobals();
});

async function renderAs(role: (typeof ROLES)[number], path: string) {
  mockApi({ 'GET /api/auth/me': userReply(makeUser(role)), 'POST /api/auth/logout': emptyResponse(204) });
  const result = renderApp(path);
  await screen.findByRole('navigation', { name: MESSAGES.nav.label });
  return result;
}

const sidebar = () => document.getElementById(SIDEBAR_ID) as HTMLElement;
/** Botón de menú de la barra superior (su nombre cambia al abrir el panel). */
const menuButton = () => document.querySelector(`button[aria-controls="${SIDEBAR_ID}"]`) as HTMLButtonElement;
const openButton = () => screen.getByRole('button', { name: MESSAGES.layout.openMenu });

describe('Sidebar', () => {
  it.each(ROLES)('muestra solo las entradas de %s, cada una con ícono y texto en español', async (role) => {
    await renderAs(role, '/calendarios');
    const nav = screen.getByRole('navigation', { name: MESSAGES.nav.label });
    const links = within(nav).getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual(menuFor(role).map((s) => s.label));
    for (const link of links) {
      expect(link.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
      expect(link).toHaveAttribute('title', link.textContent ?? '');
    }
  });

  it('clases responsivas: 256 px desde 1280, compacto (80 px, solo íconos) desde 768 y panel oculto en móvil', async () => {
    await renderAs('ADMIN', '/dashboard');
    const aside = sidebar();
    for (const cls of ['w-64', 'md:w-20', 'xl:w-64', 'fixed', 'md:sticky', 'md:translate-x-0', 'md:visible', 'transition-transform', 'duration-200']) {
      expect(aside).toHaveClass(cls);
    }
    // Cerrado por defecto en móvil: fuera de pantalla e invisible (sus enlaces no reciben el foco).
    expect(aside).toHaveAttribute('data-open', 'false');
    expect(aside).toHaveClass('-translate-x-full', 'invisible');
    // En modo compacto el texto queda solo para lectores de pantalla; desde 1280 px vuelve a verse.
    const label = within(aside).getByText(MESSAGES.nav.dashboard);
    expect(label).toHaveClass('md:sr-only', 'xl:not-sr-only');
    expect(openButton()).toHaveClass('md:hidden');
  });

  it('el botón de menú abre el panel, mueve el foco y Escape lo cierra devolviendo el foco al botón', async () => {
    await renderAs('DOCTOR', '/pacientes');
    const button = openButton();
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls', SIDEBAR_ID);
    fireEvent.click(button);
    expect(sidebar()).toHaveAttribute('data-open', 'true');
    expect(sidebar()).toHaveClass('visible', 'translate-x-0');
    expect(sidebar()).not.toHaveClass('invisible');
    expect(menuButton()).toHaveAttribute('aria-expanded', 'true');
    expect(menuButton()).toHaveAccessibleName(MESSAGES.layout.closeMenu);
    expect(screen.getByTestId('menu-overlay')).toHaveClass('md:hidden');
    expect(document.activeElement).toBe(within(sidebar()).getByRole('button', { name: MESSAGES.layout.closeMenu }));

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(sidebar()).toHaveAttribute('data-open', 'false');
    expect(screen.queryByTestId('menu-overlay')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(openButton());
  });

  it('el fondo y el botón "Cerrar menú" cierran el panel; elegir una entrada navega y lo cierra', async () => {
    const { router } = await renderAs('ADMIN', '/dashboard');
    fireEvent.click(openButton());
    fireEvent.click(screen.getByTestId('menu-overlay'));
    expect(sidebar()).toHaveAttribute('data-open', 'false');

    fireEvent.click(openButton());
    fireEvent.click(within(sidebar()).getByRole('button', { name: MESSAGES.layout.closeMenu }));
    expect(sidebar()).toHaveAttribute('data-open', 'false');

    fireEvent.click(openButton());
    fireEvent.click(within(sidebar()).getByRole('link', { name: MESSAGES.nav.rooms }));
    expect(await screen.findByRole('heading', { level: 1, name: MESSAGES.nav.rooms })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/habitaciones');
    expect(sidebar()).toHaveAttribute('data-open', 'false');
  });

  it('marca la ruta activa con aria-current, texto en negrita y barra lateral (no solo color), también en subrutas', async () => {
    await renderAs('ADMIN', '/personal/12');
    const nav = screen.getByRole('navigation', { name: MESSAGES.nav.label });
    const active = within(nav).getByRole('link', { name: MESSAGES.nav.staff });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active).toHaveClass('font-semibold', 'border-primary', 'bg-active', 'text-heading');
    const others = within(nav).getAllByRole('link').filter((l) => l !== active);
    for (const link of others) {
      expect(link).not.toHaveAttribute('aria-current');
      expect(link).toHaveClass('border-transparent');
    }
    for (const link of within(nav).getAllByRole('link')) expect(link).toHaveClass('focus-visible:ring-2');
  });

  it('"Mi perfil" no queda activo en "Mis documentos"', async () => {
    await renderAs('NURSE', '/perfil/documentos');
    const nav = screen.getByRole('navigation', { name: MESSAGES.nav.label });
    expect(within(nav).getByRole('link', { name: MESSAGES.nav.ownDocuments })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: MESSAGES.nav.profile })).not.toHaveAttribute('aria-current');
  });
});

describe('Topbar y Layout', () => {
  it('muestra el nombre, el rol en español y la foto por defecto', async () => {
    await renderAs('CLEANING', '/inventario-limpieza');
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Limpieza Ficticia')).toBeInTheDocument();
    expect(within(header).getByText(MESSAGES.roles.CLEANING)).toBeInTheDocument();
    const photo = within(header).getByRole('img', { name: MESSAGES.layout.userPhoto('Limpieza Ficticia') });
    expect(photo).toHaveAttribute('src', DEFAULT_AVATAR_SRC);
    expect(photo).toHaveClass('rounded-full');
  });

  it('"Cerrar sesión" queda deshabilitado mientras se cierra y no envía dos solicitudes', async () => {
    let finish!: (r: Response) => void;
    const api = mockApi({
      'GET /api/auth/me': userReply(makeUser('ADMIN')),
      'POST /api/auth/logout': new Promise<Response>((resolve) => (finish = resolve)),
    });
    renderApp('/dashboard');
    const button = await screen.findByRole('button', { name: MESSAGES.layout.logout });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    finish(emptyResponse(204));
    expect(await screen.findByRole('heading', { level: 1, name: MESSAGES.auth.loginTitle })).toBeInTheDocument();
    expect(api.count('POST', '/auth/logout')).toBe(1);
  });

  it('el contenido no ensancha la página (min-w-0) y hay enlace para saltar al contenido', async () => {
    await renderAs('ADMIN', '/dashboard');
    expect(screen.getByTestId('layout-content')).toHaveClass('min-w-0', 'flex-1');
    const main = screen.getByRole('main');
    expect(main).toHaveAttribute('id', 'contenido');
    expect(main).toHaveClass('min-w-0');
    const skip = screen.getByRole('link', { name: MESSAGES.layout.skipToContent });
    expect(skip).toHaveAttribute('href', '#contenido');
    expect(skip).toHaveClass('sr-only', 'focus:not-sr-only');
  });
});
