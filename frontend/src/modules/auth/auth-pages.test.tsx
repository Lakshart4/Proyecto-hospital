// Pruebas de las páginas de acceso y recuperación (tarea 5.10): validación sin solicitudes, contraseñas
// enviadas sin alteraciones, mensajes genéricos, errores en español, carga y envíos duplicados.

import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_AVATAR_SRC } from '../../shared/components/Avatar';
import { MESSAGES } from '../../shared/lib/messages';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../../shared/lib/validation';
import { UNAUTHENTICATED, jsonResponse, makeUser, mockApi, renderApp, secretOf, userReply } from '../../test/appHarness';

const LENGTH = MESSAGES.validation.newPasswordLength(PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH);
const NOT_LOGGED = { 'GET /api/auth/me': jsonResponse(401, UNAUTHENTICATED) };

const change = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name: new RegExp(`${name}$`) }));
const page = (title: string) => screen.findByRole('heading', { level: 1, name: title });
const postsTo = (api: ReturnType<typeof mockApi>, path: string) => api.calls.filter((c) => c.method === 'POST' && c.url === `/api${path}`);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
  vi.unstubAllGlobals();
});

describe('LoginPage', () => {
  it('muestra la ilustración local y el enlace "¿Olvidaste tu contraseña?"', async () => {
    mockApi(NOT_LOGGED);
    const { router } = renderApp('/login');
    await page(MESSAGES.auth.loginTitle);
    expect(screen.getByRole('img', { name: MESSAGES.auth.illustrationAlt })).toHaveAttribute('src', DEFAULT_AVATAR_SRC);
    fireEvent.click(screen.getByRole('link', { name: MESSAGES.auth.forgotLink }));
    await page(MESSAGES.auth.forgotTitle);
    expect(router.state.location.pathname).toBe('/recuperar-contrasena');
  });

  it('valida al enviar: vacío, solo espacios y correo inválido no envían nada y conservan los valores', async () => {
    const api = mockApi(NOT_LOGGED);
    renderApp('/login');
    await page(MESSAGES.auth.loginTitle);
    click(MESSAGES.auth.loginSubmit);
    expect(screen.getAllByText(MESSAGES.validation.required)).toHaveLength(1);
    expect(screen.getByText(MESSAGES.validation.passwordRequired)).toBeInTheDocument();

    change(/Correo electrónico/, 'sin-arroba');
    change(/^Contraseña/, '     ');
    click(MESSAGES.auth.loginSubmit);
    expect(screen.getByText(MESSAGES.validation.invalidEmail)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.validation.passwordRequired)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue('     ');
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue('sin-arroba');
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveAttribute('aria-invalid', 'true');
    expect(postsTo(api, '/auth/login')).toHaveLength(0);
  });

  it('credenciales incorrectas: mensaje genérico del Backend, sin borrar el formulario ni redirigir', async () => {
    const typed = secretOf('incorrecta', 'pero', 'larga');
    const api = mockApi({ ...NOT_LOGGED, 'POST /api/auth/login': jsonResponse(401, { code: 'UNAUTHENTICATED', message: 'Credenciales incorrectas.' }) });
    const { router } = renderApp('/login');
    await page(MESSAGES.auth.loginTitle);
    change(/Correo electrónico/, 'nadie@example.com');
    change(/^Contraseña/, typed);
    click(MESSAGES.auth.loginSubmit);
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas.');
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue(typed);
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue('nadie@example.com');
    expect(router.state.location.pathname).toBe('/login');
    expect(postsTo(api, '/auth/login')[0]?.body).toEqual({ email: 'nadie@example.com', password: typed });
  });

  it('muestra carga, deshabilita el botón e ignora envíos duplicados', async () => {
    let finish!: (r: Response) => void;
    const api = mockApi({ ...NOT_LOGGED, 'POST /api/auth/login': new Promise<Response>((resolve) => (finish = resolve)) });
    renderApp('/login');
    await page(MESSAGES.auth.loginTitle);
    change(/Correo electrónico/, 'admin@example.com');
    change(/^Contraseña/, 'a'.repeat(10));
    click(MESSAGES.auth.loginSubmit);
    click(MESSAGES.auth.loginSubmit);
    fireEvent.submit(screen.getByLabelText(/^Contraseña/).closest('form') as HTMLFormElement);
    const button = screen.getByRole('button', { name: new RegExp(`${MESSAGES.auth.loginSubmit}$`) });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByLabelText(/^Contraseña/)).toBeDisabled();
    await act(async () => finish(userReply(makeUser('ADMIN'))));
    await page(MESSAGES.nav.dashboard);
    expect(postsTo(api, '/auth/login')).toHaveLength(1);
  });

  it.each([
    ['429', jsonResponse(429, { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' }), 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.'],
    ['500', jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno. Inténtalo de nuevo más tarde.' }), 'Ocurrió un error interno. Inténtalo de nuevo más tarde.'],
    ['un 400 con errors[]', jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', errors: [{ field: 'email', message: 'Este campo es obligatorio.' }] }), null],
  ])('ante %s muestra el mensaje en español y conserva los datos', async (_label, reply, message) => {
    mockApi({ ...NOT_LOGGED, 'POST /api/auth/login': reply });
    renderApp('/login');
    await page(MESSAGES.auth.loginTitle);
    change(/Correo electrónico/, 'admin@example.com');
    change(/^Contraseña/, 'a'.repeat(10));
    click(MESSAGES.auth.loginSubmit);
    if (message) expect(await screen.findByRole('alert')).toHaveTextContent(message);
    else expect(await screen.findByText('Este campo es obligatorio.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña/)).toHaveValue('a'.repeat(10));
    expect(screen.getByRole('button', { name: new RegExp(`${MESSAGES.auth.loginSubmit}$`) })).not.toBeDisabled();
  });

  it('un fallo de red muestra un mensaje en español', async () => {
    mockApi(NOT_LOGGED);
    renderApp('/login');
    await page(MESSAGES.auth.loginTitle);
    change(/Correo electrónico/, 'admin@example.com');
    change(/^Contraseña/, 'a'.repeat(10));
    click(MESSAGES.auth.loginSubmit);
    expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGES.api.network);
  });
});

describe('ForgotPasswordPage', () => {
  it('muestra siempre el mismo mensaje, exista o no la cuenta, y envía el correo escrito', async () => {
    const generic = 'Si el correo corresponde a una cuenta activa, recibirás un enlace para restablecer tu contraseña.';
    for (const email of ['existe@example.com', 'no-existe@example.com']) {
      const api = mockApi({ ...NOT_LOGGED, 'POST /api/auth/forgot-password': jsonResponse(200, { message: generic }) });
      const { unmount } = renderApp('/recuperar-contrasena');
      await page(MESSAGES.auth.forgotTitle);
      change(/Correo electrónico/, email);
      click(MESSAGES.auth.forgotSubmit);
      expect(await screen.findByText(MESSAGES.auth.forgotDone)).toHaveAttribute('role', 'status');
      expect(MESSAGES.auth.forgotDone).toBe(generic);
      expect(postsTo(api, '/auth/forgot-password')[0]?.body).toEqual({ email });
      expect(screen.getByRole('link', { name: MESSAGES.auth.backToLogin })).toHaveAttribute('href', '/login');
      unmount();
      vi.unstubAllGlobals();
    }
  });

  it('valida el correo sin enviar y muestra el 429 en español', async () => {
    const api = mockApi({ ...NOT_LOGGED, 'POST /api/auth/forgot-password': jsonResponse(429, { code: 'TOO_MANY_REQUESTS', message: 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.' }) });
    renderApp('/recuperar-contrasena');
    await page(MESSAGES.auth.forgotTitle);
    change(/Correo electrónico/, '   ');
    click(MESSAGES.auth.forgotSubmit);
    expect(screen.getByText(MESSAGES.validation.required)).toBeInTheDocument();
    expect(postsTo(api, '/auth/forgot-password')).toHaveLength(0);
    change(/Correo electrónico/, 'alguien@example.com');
    click(MESSAGES.auth.forgotSubmit);
    expect(await screen.findByRole('alert')).toHaveTextContent('Demasiados intentos');
    expect(screen.getByLabelText(/Correo electrónico/)).toHaveValue('alguien@example.com');
  });
});

describe('ResetPasswordPage', () => {
  const TOKEN = 'tk_'.concat('a'.repeat(40));

  it('sin token muestra que el enlace es inválido y ofrece pedir otro', async () => {
    const api = mockApi(NOT_LOGGED);
    renderApp('/restablecer');
    await page(MESSAGES.auth.resetTitle);
    expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.auth.invalidResetLink);
    expect(screen.getByRole('link', { name: MESSAGES.auth.requestNewLink })).toHaveAttribute('href', '/recuperar-contrasena');
    expect(screen.queryByLabelText(/^Nueva contraseña/)).not.toBeInTheDocument();
    expect(postsTo(api, '/auth/reset-password')).toHaveLength(0);
  });

  it('valida longitud (8 a 128 con String.length), solo espacios y confirmación sin enviar nada', async () => {
    const api = mockApi(NOT_LOGGED);
    renderApp(`/restablecer?token=${TOKEN}`);
    await page(MESSAGES.auth.resetTitle);
    const cases: [string, string, string][] = [
      ['a'.repeat(PASSWORD_MIN_LENGTH - 1), 'a'.repeat(PASSWORD_MIN_LENGTH - 1), LENGTH],
      ['a'.repeat(PASSWORD_MAX_LENGTH + 1), 'a'.repeat(PASSWORD_MAX_LENGTH + 1), LENGTH],
      [' '.repeat(10), ' '.repeat(10), MESSAGES.validation.passwordRequired],
      ['a'.repeat(10), 'a'.repeat(10).concat(' '), MESSAGES.auth.passwordsDoNotMatch],
    ];
    for (const [value, confirmation, message] of cases) {
      change(/^Nueva contraseña/, value);
      change(/Confirma la nueva contraseña/, confirmation);
      click(MESSAGES.auth.resetSubmit);
      expect(screen.getByText(message)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Nueva contraseña/)).toHaveValue(value);
    }
    expect(postsTo(api, '/auth/reset-password')).toHaveLength(0);
  });

  it('envía el token y la contraseña tal cual (sin la confirmación) y muestra el éxito', async () => {
    const typed = secretOf('', 'nueva', 'clave', '');
    expect(typed.startsWith(' ') && typed.endsWith(' ')).toBe(true);
    const api = mockApi({ ...NOT_LOGGED, 'POST /api/auth/reset-password': jsonResponse(200, { message: 'ok' }) });
    renderApp(`/restablecer?token=${TOKEN}`);
    await page(MESSAGES.auth.resetTitle);
    change(/^Nueva contraseña/, typed);
    change(/Confirma la nueva contraseña/, typed);
    click(MESSAGES.auth.resetSubmit);
    expect(await screen.findByText(MESSAGES.auth.resetDone)).toHaveAttribute('role', 'status');
    expect(postsTo(api, '/auth/reset-password')[0]?.body).toEqual({ token: TOKEN, newPassword: typed });
    expect(screen.getByRole('link', { name: MESSAGES.auth.backToLogin })).toBeInTheDocument();
  });

  it('un enlace vencido (400) muestra el mensaje del Backend y conserva la contraseña escrita', async () => {
    mockApi({
      ...NOT_LOGGED,
      'POST /api/auth/reset-password': jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'El enlace es inválido o venció.', errors: [{ field: 'token', message: 'El enlace es inválido o venció.' }] }),
    });
    renderApp(`/restablecer?token=${TOKEN}`);
    await page(MESSAGES.auth.resetTitle);
    change(/^Nueva contraseña/, 'b'.repeat(12));
    change(/Confirma la nueva contraseña/, 'b'.repeat(12));
    click(MESSAGES.auth.resetSubmit);
    expect(await screen.findByRole('alert')).toHaveTextContent('El enlace es inválido o venció.');
    expect(screen.getByLabelText(/^Nueva contraseña/)).toHaveValue('b'.repeat(12));
    expect(screen.getByRole('link', { name: MESSAGES.auth.requestNewLink })).toBeInTheDocument();
  });

  it('un 400 del campo newPassword aparece junto al campo', async () => {
    const message = 'La nueva contraseña debe tener entre 8 y 128 caracteres.';
    mockApi({ ...NOT_LOGGED, 'POST /api/auth/reset-password': jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', errors: [{ field: 'newPassword', message }] }) });
    renderApp(`/restablecer?token=${TOKEN}`);
    await page(MESSAGES.auth.resetTitle);
    change(/^Nueva contraseña/, 'c'.repeat(12));
    change(/Confirma la nueva contraseña/, 'c'.repeat(12));
    click(MESSAGES.auth.resetSubmit);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nueva contraseña/)).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('ChangePasswordPage (voluntario)', () => {
  it('con la contraseña actual incorrecta muestra el error junto al campo; con éxito muestra el aviso y vacía el formulario', async () => {
    const wrong = 'La contraseña actual es incorrecta.';
    const api = mockApi({
      'GET /api/auth/me': userReply(makeUser('DOCTOR')),
      'POST /api/auth/change-password': [
        jsonResponse(400, { code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.', errors: [{ field: 'currentPassword', message: wrong }] }),
        jsonResponse(200, { message: 'La contraseña se cambió correctamente.' }),
      ],
    });
    const { router } = renderApp('/cambiar-contrasena');
    await page(MESSAGES.auth.changeTitle);
    expect(screen.queryByText(MESSAGES.auth.changeRequired)).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: MESSAGES.nav.label })).toBeInTheDocument();

    const current = secretOf('actual', ' con espacios ');
    const next = 'n'.repeat(PASSWORD_MAX_LENGTH);
    change(/Contraseña actual/, current);
    change(/^Nueva contraseña/, next);
    change(/Confirma la nueva contraseña/, next);
    click(MESSAGES.auth.changeSubmit);
    expect(await screen.findByText(wrong)).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue(current);

    click(MESSAGES.auth.changeSubmit);
    expect(await screen.findByText(MESSAGES.auth.changeDone)).toHaveAttribute('role', 'status');
    await waitFor(() => expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue(''));
    expect(router.state.location.pathname).toBe('/cambiar-contrasena');
    const bodies = postsTo(api, '/auth/change-password').map((c) => c.body);
    expect(bodies).toEqual([
      { currentPassword: current, newPassword: next },
      { currentPassword: current, newPassword: next },
    ]);
  });

  it('valida sin enviar: actual vacía, nueva corta y confirmación distinta', async () => {
    const api = mockApi({ 'GET /api/auth/me': userReply(makeUser('ADMIN')) });
    renderApp('/cambiar-contrasena');
    await page(MESSAGES.auth.changeTitle);
    change(/^Nueva contraseña/, 'corta');
    click(MESSAGES.auth.changeSubmit);
    expect(screen.getByText(MESSAGES.validation.passwordRequired)).toBeInTheDocument();
    expect(screen.getByText(LENGTH)).toBeInTheDocument();
    change(/Contraseña actual/, 'x'.repeat(9));
    change(/^Nueva contraseña/, 'y'.repeat(9));
    change(/Confirma la nueva contraseña/, 'z'.repeat(9));
    click(MESSAGES.auth.changeSubmit);
    expect(screen.getByText(MESSAGES.auth.passwordsDoNotMatch)).toBeInTheDocument();
    expect(postsTo(api, '/auth/change-password')).toHaveLength(0);
  });
});
