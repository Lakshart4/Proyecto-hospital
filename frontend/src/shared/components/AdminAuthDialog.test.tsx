// Pruebas de AdminAuthDialog y useAdminAuth con el cliente API real y fetch simulado (tarea 5.12).

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { apiClient, configureApiClient, resetApiClientConfig, toApiError } from '../lib/apiClient';
import { formatTime } from '../lib/formatters';
import { MESSAGES } from '../lib/messages';
import { AdminAuthDialog } from './AdminAuthDialog';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ADMIN_REQUIRED = jsonResponse.bind(null, 403, { code: 'AUTORIZACION_ADMIN_REQUERIDA', message: 'Se requiere una autorización administrativa vigente.' });
const DOCUMENTS = jsonResponse.bind(null, 200, { data: 'documentos del empleado 7' });
// Vencimiento real: 10 minutos después del inicio de la prueba.
const EXPIRES_AT = new Date(Date.now() + 10 * 60_000).toISOString();
const GRANTED = jsonResponse.bind(null, 201, { expiresAt: EXPIRES_AT });
const WRONG_PASSWORD = jsonResponse.bind(null, 401, { code: 'UNAUTHENTICATED', message: 'La contraseña es incorrecta.' });
const SESSION_EXPIRED = jsonResponse.bind(null, 401, { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.' });
const ME = jsonResponse.bind(null, 200, { user: { id: 1, email: 'director@example.com', name: 'Director', role: 'ADMIN', mustChangePassword: false } });

// Valores de prueba armados en tiempo de ejecución (no hay contraseñas literales en el repositorio).
const TYPED = ['  clave', 'con', 'espacios  '].join(' ');
const OTHER = ['otra', 'clave', 'de', 'prueba'].join('-');

const fetchMock = vi.fn<typeof fetch>();
const onUnauthenticated = vi.fn();

function calls(): { method: string; url: string; body: unknown }[] {
  return fetchMock.mock.calls.map(([url, init]) => ({
    method: init?.method ?? 'GET',
    url: String(url),
    body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
  }));
}

/** Pantalla mínima que pide documentos protegidos con `withAdminAuth`. */
function Harness() {
  const adminAuth = useAdminAuth();
  const [result, setResult] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const open = () => {
    adminAuth
      .withAdminAuth(() => apiClient.get<{ data: string }>('/staff/7/documents'))
      .then(
        (response) => setResult(response.data),
        (reason: unknown) => setFailure(toApiError(reason).code ?? 'sin código'),
      );
  };
  return (
    <>
      <button type="button" onClick={open}>
        Ver documentos
      </button>
      {result && <p>Resultado: {result}</p>}
      {failure && <p>Fallo: {failure}</p>}
      {adminAuth.expiresAt && <p>Vigente hasta {adminAuth.expiresAt.toISOString()}</p>}
      <AdminAuthDialog {...adminAuth.dialog} />
    </>
  );
}

const passwordInput = () => screen.getByLabelText(/Contraseña del Administrador/) as HTMLInputElement;
// Mientras carga, el nombre accesible incluye el texto del Spinner ("Cargando… Autorizar").
const submitButton = () => screen.getByRole('button', { name: new RegExp(`${MESSAGES.adminAuth.submit}$`) });
const dialog = () => screen.queryByRole('dialog', { name: MESSAGES.adminAuth.title });

async function openDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver documentos' }));
  await waitFor(() => expect(dialog()).toBeInTheDocument());
}

function typeAndSubmit(value: string) {
  fireEvent.change(passwordInput(), { target: { value } });
  fireEvent.click(submitButton());
}

beforeEach(() => {
  fetchMock.mockReset();
  onUnauthenticated.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient({ onUnauthenticated });
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetApiClientConfig();
});

describe('AdminAuthDialog + useAdminAuth', () => {
  it('ante AUTORIZACION_ADMIN_REQUERIDA abre el diálogo, autoriza con la contraseña tal cual y repite la solicitud una sola vez', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED()).mockResolvedValueOnce(GRANTED()).mockResolvedValueOnce(DOCUMENTS());
    render(<Harness />);
    await openDialog();
    expect(screen.getByText(MESSAGES.adminAuth.description)).toBeInTheDocument();
    expect(passwordInput()).toHaveAttribute('type', 'password');

    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByText('Resultado: documentos del empleado 7')).toBeInTheDocument());

    expect(calls()).toEqual([
      { method: 'GET', url: '/api/staff/7/documents', body: undefined },
      { method: 'POST', url: '/api/admin-authorization', body: { password: TYPED } },
      { method: 'GET', url: '/api/staff/7/documents', body: undefined },
    ]);
    expect(fetchMock.mock.calls.every(([, init]) => init?.credentials === 'include')).toBe(true);
    expect(dialog()).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(MESSAGES.adminAuth.grantedUntil(formatTime(new Date(EXPIRES_AT))));
    expect(screen.getByText(`Vigente hasta ${EXPIRES_AT}`)).toBeInTheDocument();
    expect(onUnauthenticated).not.toHaveBeenCalled();
    // La contraseña no queda en ningún almacenamiento del navegador.
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('la contraseña vacía o solo con espacios muestra el error junto al campo y no envía ninguna solicitud', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED());
    render(<Harness />);
    await openDialog();
    for (const value of ['', '    ']) {
      typeAndSubmit(value);
      expect(screen.getByText(MESSAGES.validation.passwordRequired)).toBeInTheDocument();
      expect(passwordInput()).toHaveAttribute('aria-invalid', 'true');
    }
    expect(passwordInput().value).toBe('    ');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('contraseña incorrecta con la Sesión activa: consulta /auth/me, muestra el error en el diálogo y no cierra la Sesión', async () => {
    fetchMock
      .mockResolvedValueOnce(ADMIN_REQUIRED())
      .mockResolvedValueOnce(WRONG_PASSWORD())
      .mockResolvedValueOnce(ME())
      .mockResolvedValueOnce(GRANTED())
      .mockResolvedValueOnce(DOCUMENTS());
    render(<Harness />);
    await openDialog();
    typeAndSubmit(OTHER);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('La contraseña es incorrecta.'));
    expect(dialog()).toBeInTheDocument();
    expect(passwordInput().value).toBe(OTHER);
    expect(passwordInput()).not.toBeDisabled();
    expect(submitButton()).not.toBeDisabled();
    expect(onUnauthenticated).not.toHaveBeenCalled();
    expect(calls().slice(1, 3)).toEqual([
      { method: 'POST', url: '/api/admin-authorization', body: { password: OTHER } },
      { method: 'GET', url: '/api/auth/me', body: undefined },
    ]);

    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByText('Resultado: documentos del empleado 7')).toBeInTheDocument());
    expect(calls()[3]).toEqual({ method: 'POST', url: '/api/admin-authorization', body: { password: TYPED } });
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it('Sesión expirada: /auth/me responde 401, se limpia al usuario y se lleva a /login, sin repetir la solicitud', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED()).mockResolvedValueOnce(SESSION_EXPIRED()).mockResolvedValueOnce(SESSION_EXPIRED());
    render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);

    await waitFor(() => expect(screen.getByText('Fallo: UNAUTHENTICATED')).toBeInTheDocument());
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    expect(dialog()).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(calls().map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/staff/7/documents',
      'POST /api/admin-authorization',
      'GET /api/auth/me',
    ]);
  });

  it('mientras se envía muestra la carga, ignora envíos duplicados y no permite cerrar el diálogo', async () => {
    let finish!: (response: Response) => void;
    fetchMock
      .mockResolvedValueOnce(ADMIN_REQUIRED())
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (finish = resolve)))
      .mockResolvedValueOnce(DOCUMENTS());
    render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);
    fireEvent.click(submitButton());
    fireEvent.submit(passwordInput().form as HTMLFormElement);

    await waitFor(() => expect(submitButton()).toBeDisabled());
    expect(submitButton()).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: MESSAGES.common.cancel })).toBeDisabled();
    expect(passwordInput()).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.common.close }));
    expect(dialog()).toBeInTheDocument();
    expect(calls().filter((c) => c.method === 'POST')).toHaveLength(1);

    await act(async () => finish(GRANTED()));
    await waitFor(() => expect(screen.getByText('Resultado: documentos del empleado 7')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('429: muestra el mensaje del Backend en el diálogo sin consultar /auth/me', async () => {
    const message = 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.';
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED()).mockResolvedValueOnce(jsonResponse(429, { code: 'TOO_MANY_REQUESTS', message }));
    render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(message));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('un fallo de red se muestra en español dentro del diálogo', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED()).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(MESSAGES.api.network));
    expect(dialog()).toBeInTheDocument();
  });

  it('"Cancelar" cierra el diálogo sin enviar la contraseña y la solicitud termina con su error original', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED());
    render(<Harness />);
    await openDialog();
    fireEvent.change(passwordInput(), { target: { value: TYPED } });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.common.cancel }));
    await waitFor(() => expect(screen.getByText('Fallo: AUTORIZACION_ADMIN_REQUERIDA')).toBeInTheDocument());
    expect(dialog()).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Al volver a abrirlo, el campo empieza vacío.
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED());
    await openDialog();
    expect(passwordInput().value).toBe('');
  });

  it('Escape también cierra el diálogo cuando no se está enviando', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED());
    render(<Harness />);
    await openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(dialog()).not.toBeInTheDocument());
  });

  it('si la repetición vuelve a pedir autorización, no se repite otra vez ni se reabre el diálogo', async () => {
    fetchMock.mockResolvedValueOnce(ADMIN_REQUIRED()).mockResolvedValueOnce(GRANTED()).mockResolvedValueOnce(ADMIN_REQUIRED());
    render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByText('Fallo: AUTORIZACION_ADMIN_REQUERIDA')).toBeInTheDocument());
    expect(dialog()).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('el estado de la autorización se borra al vencer, también si el vencimiento supera el máximo de setTimeout', async () => {
    const soon = new Date(Date.now() + 80).toISOString();
    const far = new Date(Date.now() + 30 * 24 * 3_600_000).toISOString();
    fetchMock
      .mockResolvedValueOnce(ADMIN_REQUIRED())
      .mockResolvedValueOnce(jsonResponse(201, { expiresAt: far }))
      .mockResolvedValueOnce(DOCUMENTS());
    const { unmount } = render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByText(`Vigente hasta ${far}`)).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(`Vigente hasta ${far}`)).toBeInTheDocument();
    unmount();

    fetchMock
      .mockResolvedValueOnce(ADMIN_REQUIRED())
      .mockResolvedValueOnce(jsonResponse(201, { expiresAt: soon }))
      .mockResolvedValueOnce(DOCUMENTS());
    render(<Harness />);
    await openDialog();
    typeAndSubmit(TYPED);
    await waitFor(() => expect(screen.getByText('Resultado: documentos del empleado 7')).toBeInTheDocument());
    await waitFor(() => expect(screen.queryByText(`Vigente hasta ${soon}`)).not.toBeInTheDocument());
  });

  it('otros errores llegan al llamador sin abrir el diálogo', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { code: 'NOT_FOUND', message: 'El registro solicitado no existe.' }));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Ver documentos' }));
    await waitFor(() => expect(screen.getByText('Fallo: NOT_FOUND')).toBeInTheDocument());
    expect(dialog()).not.toBeInTheDocument();
  });
});
