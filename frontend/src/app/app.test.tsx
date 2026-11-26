// Pruebas de integración de AuthProvider, rutas, guardas y manejo de 401 (tareas 5.7 y 5.10).

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../shared/lib/apiClient';
import { MESSAGES } from '../shared/lib/messages';
import { UNAUTHENTICATED, emptyResponse, jsonResponse, makeUser, mockApi, navigateTo, renderApp, secretOf, userReply } from '../test/appHarness';

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

describe('carga inicial de la Sesión', () => {
  it('muestra la carga y luego la página de inicio del rol, con una sola consulta a /auth/me aun con StrictMode', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const api = mockApi({ 'GET /api/auth/me': gate.then(() => userReply(makeUser('ADMIN'))) });
    const { router } = renderApp('/', { strict: true });
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGES.auth.loadingSession);
    await act(async () => release());
    await heading(MESSAGES.nav.dashboard);
    expect(router.state.location.pathname).toBe('/dashboard');
    expect(api.count('GET', '/auth/me')).toBe(1);
    expect(api.calls[0]?.credentials).toBe('include');
  });

  it.each([
    ['DOCTOR', '/pacientes', MESSAGES.nav.patients],
    ['NURSE', '/pacientes', MESSAGES.nav.patients],
    ['CLEANING', '/perfil', MESSAGES.nav.profile],
  ] as const)('%s empieza en %s', async (role, path, title) => {
    mockApi({ 'GET /api/auth/me': userReply(makeUser(role)) });
    const { router } = renderApp('/');
    await heading(title);
    expect(router.state.location.pathname).toBe(path);
  });

  it('sin Sesión (401) lleva a /login recordando la ruta, sin ciclos ni más consultas', async () => {
    const api = mockApi({ 'GET /api/auth/me': jsonResponse(401, UNAUTHENTICATED) });
    const { router } = renderApp('/pacientes/3?tab=historial', { strict: true });
    await heading(MESSAGES.auth.loginTitle);
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/pacientes/3?tab=historial' });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(api.calls).toHaveLength(1);
  });

  it('una respuesta inválida o un fallo de red en /auth/me deja la app sin Sesión', async () => {
    mockApi({ 'GET /api/auth/me': jsonResponse(200, { user: { id: 1, role: 'SUPERUSUARIO' } }) });
    const first = renderApp('/dashboard');
    await heading(MESSAGES.auth.loginTitle);
    first.unmount();
    mockApi({});
    renderApp('/dashboard');
    await heading(MESSAGES.auth.loginTitle);
  });

  it('con Sesión, /login lleva a la página de inicio; una ruta inexistente muestra "Página no encontrada"', async () => {
    mockApi({ 'GET /api/auth/me': userReply(makeUser('NURSE')) });
    const { router } = renderApp('/login');
    await heading(MESSAGES.nav.patients);
    await navigateTo(router, '/no-existe');
    await heading(MESSAGES.layout.notFoundTitle);
    fireEvent.click(screen.getByRole('link', { name: MESSAGES.layout.goHome }));
    await heading(MESSAGES.nav.patients);
  });
});

describe('inicio y cierre de sesión', () => {
  it('login correcto: envía las credenciales tal cual y vuelve a la ruta pedida antes de iniciar sesión', async () => {
    const typed = ['  clave', 'con', 'espacios  '].join(' ');
    const api = mockApi({
      'GET /api/auth/me': jsonResponse(401, UNAUTHENTICATED),
      'POST /api/auth/login': userReply(makeUser('DOCTOR')),
    });
    const { router } = renderApp('/pacientes/5');
    await heading(MESSAGES.auth.loginTitle);
    const email = screen.getByLabelText(/Correo electrónico/) as HTMLInputElement;
    fireEvent.change(email, { target: { value: 'Doctor@Example.com' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: typed } });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.auth.loginSubmit }));
    await heading('Detalle del paciente');
    expect(router.state.location.pathname).toBe('/pacientes/5');
    const login = api.calls.find((c) => c.url === '/api/auth/login');
    // El correo y la contraseña llegan sin cambios (ni recorte ni minúsculas).
    expect(login?.body).toEqual({ email: 'Doctor@Example.com', password: typed });
  });

  it('si la ruta pedida no está permitida para el rol, va a su página de inicio', async () => {
    mockApi({ 'GET /api/auth/me': jsonResponse(401, UNAUTHENTICATED), 'POST /api/auth/login': userReply(makeUser('CLEANING')) });
    const { router } = renderApp('/habitaciones');
    await heading(MESSAGES.auth.loginTitle);
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'cleaning@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: 'x'.repeat(9) } });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.auth.loginSubmit }));
    await heading(MESSAGES.nav.profile);
    expect(router.state.location.pathname).toBe('/perfil');
  });

  it('logout: POST /auth/logout, limpia al usuario y lleva a /login; luego las rutas protegidas piden iniciar sesión', async () => {
    const api = mockApi({ 'GET /api/auth/me': userReply(makeUser('ADMIN')), 'POST /api/auth/logout': emptyResponse(204) });
    const { router } = renderApp('/dashboard');
    await heading(MESSAGES.nav.dashboard);
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.layout.logout }));
    await heading(MESSAGES.auth.loginTitle);
    expect(api.count('POST', '/auth/logout')).toBe(1);
    await navigateTo(router, '/dashboard');
    await heading(MESSAGES.auth.loginTitle);
    expect(api.count('GET', '/auth/me')).toBe(1);
  });

  it('logout con fallo de red también cierra la sesión en el navegador', async () => {
    mockApi({ 'GET /api/auth/me': userReply(makeUser('NURSE')) });
    renderApp('/pacientes');
    await heading(MESSAGES.nav.patients);
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.layout.logout }));
    await heading(MESSAGES.auth.loginTitle);
  });
});

describe('401 durante el uso', () => {
  it('un 401 de una petición normal limpia al usuario y navega a /login con React Router, sin recargar', async () => {
    const api = mockApi({ 'GET /api/auth/me': userReply(makeUser('ADMIN')), 'GET /api/patients': jsonResponse(401, UNAUTHENTICATED) });
    const { router } = renderApp('/habitaciones');
    await heading(MESSAGES.nav.rooms);
    // Marca en el documento: una recarga real la perdería.
    document.body.dataset.marca = 'sin-recarga';
    await act(async () => {
      await apiClient.get('/patients').catch(() => undefined);
    });
    await heading(MESSAGES.auth.loginTitle);
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.state).toEqual({ from: '/habitaciones' });
    expect(document.body.dataset.marca).toBe('sin-recarga');
    delete document.body.dataset.marca;
    // Al volver a iniciar sesión no se consulta /auth/me otra vez: el usuario ya se limpió.
    expect(api.count('GET', '/auth/me')).toBe(1);
  });

  it('un 401 de POST /admin-authorization (contraseña incorrecta) no cierra la sesión; un 401 de /auth/me sí', async () => {
    mockApi({
      'GET /api/auth/me': [userReply(makeUser('ADMIN')), jsonResponse(401, UNAUTHENTICATED)],
      'POST /api/admin-authorization': jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'La contraseña es incorrecta.' }),
    });
    const { router } = renderApp('/personal/7');
    await heading(MESSAGES.nav.staff);
    await act(async () => {
      const wrongAdminPassword = secretOf('clave', 'equivocada');
      await apiClient.post('/admin-authorization', { password: wrongAdminPassword }).catch(() => undefined);
    });
    expect(router.state.location.pathname).toBe('/personal/7');
    expect(screen.getByRole('heading', { level: 1, name: MESSAGES.nav.staff })).toBeInTheDocument();
    await act(async () => {
      await apiClient.get('/auth/me').catch(() => undefined);
    });
    await heading(MESSAGES.auth.loginTitle);
  });

  it('un 401 en las páginas públicas no redirige ni cambia la página', async () => {
    mockApi({ 'GET /api/auth/me': jsonResponse(401, UNAUTHENTICATED), 'GET /api/x': jsonResponse(401, UNAUTHENTICATED) });
    const { router } = renderApp('/recuperar-contrasena');
    await heading(MESSAGES.auth.forgotTitle);
    await act(async () => {
      await apiClient.get('/x').catch(() => undefined);
    });
    expect(router.state.location.pathname).toBe('/recuperar-contrasena');
  });
});

describe('rutas por rol (RoleGuard)', () => {
  it.each([
    ['DOCTOR', '/habitaciones', '/pacientes', MESSAGES.nav.patients],
    ['NURSE', '/dashboard', '/pacientes', MESSAGES.nav.patients],
    ['CLEANING', '/pacientes/2', '/perfil', MESSAGES.nav.profile],
    ['CLEANING', '/personal/nuevo', '/perfil', MESSAGES.nav.profile],
    ['ADMIN', '/perfil/documentos', '/dashboard', MESSAGES.nav.dashboard],
  ] as const)('%s en %s va de inmediato a %s con el aviso "Acceso denegado"', async (role, from, to, title) => {
    mockApi({ 'GET /api/auth/me': userReply(makeUser(role)) });
    const { router } = renderApp(from);
    await heading(title);
    expect(router.state.location.pathname).toBe(to);
    expect(screen.getByText(MESSAGES.nav.accessDenied)).toBeInTheDocument();
  });

  it('el aviso se puede cerrar y no aparece en una navegación permitida', async () => {
    mockApi({ 'GET /api/auth/me': userReply(makeUser('DOCTOR')) });
    const { router } = renderApp('/habitaciones');
    await heading(MESSAGES.nav.patients);
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.common.close }));
    expect(screen.queryByText(MESSAGES.nav.accessDenied)).not.toBeInTheDocument();
    await navigateTo(router, '/perfil');
    await heading(MESSAGES.nav.profile);
    expect(screen.queryByText(MESSAGES.nav.accessDenied)).not.toBeInTheDocument();
  });

  it('las secciones permitidas se abren, incluidas sus subrutas y en mayúsculas', async () => {
    mockApi({ 'GET /api/auth/me': userReply(makeUser('ADMIN')) });
    const { router } = renderApp('/personal/nuevo');
    await heading(MESSAGES.nav.staff);
    await navigateTo(router, '/HABITACIONES');
    await heading(MESSAGES.nav.rooms);
    await navigateTo(router, '/perfil');
    await heading(MESSAGES.nav.profile);
  });
});

describe('cambio de contraseña obligatorio', () => {
  it('una cuenta nueva solo puede abrir /cambiar-contrasena, sin menú, hasta cambiarla', async () => {
    const api = mockApi({
      'GET /api/auth/me': userReply(makeUser('NURSE', { mustChangePassword: true })),
      'POST /api/auth/change-password': jsonResponse(200, { message: 'La contraseña se cambió correctamente.' }),
    });
    const { router } = renderApp('/pacientes');
    await heading(MESSAGES.auth.changeTitle);
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
    expect(screen.getByText(MESSAGES.auth.changeRequired)).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: MESSAGES.nav.label })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.layout.openMenu })).not.toBeInTheDocument();

    for (const path of ['/calendarios', '/perfil', '/', '/no-existe']) {
      await navigateTo(router, path);
      expect(router.state.location.pathname).toBe('/cambiar-contrasena');
    }

    const current = 'c'.repeat(12);
    const next = ['nueva', 'clave', 'segura'].join(' ');
    fireEvent.change(screen.getByLabelText(/Contraseña actual/), { target: { value: current } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/), { target: { value: next } });
    fireEvent.change(screen.getByLabelText(/Confirma la nueva contraseña/), { target: { value: next } });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.auth.changeSubmit }));

    await heading(MESSAGES.nav.patients);
    expect(router.state.location.pathname).toBe('/pacientes');
    expect(screen.getByRole('navigation', { name: MESSAGES.nav.label })).toBeInTheDocument();
    expect(api.calls.find((c) => c.url === '/api/auth/change-password')?.body).toEqual({ currentPassword: current, newPassword: next });
  });

  it('tras un login con mustChangePassword se va a /cambiar-contrasena', async () => {
    mockApi({
      'GET /api/auth/me': jsonResponse(401, UNAUTHENTICATED),
      'POST /api/auth/login': userReply(makeUser('DOCTOR', { mustChangePassword: true })),
    });
    const { router } = renderApp('/login');
    await heading(MESSAGES.auth.loginTitle);
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'doctor@example.com' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña/), { target: { value: 'i'.repeat(12) } });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.auth.loginSubmit }));
    await heading(MESSAGES.auth.changeTitle);
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
  });

  it('el 403 PASSWORD_CHANGE_REQUIRED de otra petición no cierra la sesión', async () => {
    mockApi({
      'GET /api/auth/me': userReply(makeUser('NURSE', { mustChangePassword: true })),
      'GET /api/patients': jsonResponse(403, { code: 'PASSWORD_CHANGE_REQUIRED', message: 'Debes cambiar tu contraseña antes de continuar.' }),
    });
    const { router } = renderApp('/cambiar-contrasena');
    await heading(MESSAGES.auth.changeTitle);
    await act(async () => {
      await apiClient.get('/patients').catch(() => undefined);
    });
    await waitFor(() => expect(router.state.location.pathname).toBe('/cambiar-contrasena'));
  });
});
