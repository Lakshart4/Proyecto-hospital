// Pruebas del cliente API (tarea 5.3): prefijo y cookies, cuerpos JSON y vacíos, conversión a ApiError,
// errores de red y de tiempo, y redirección ante 401 salvo en las solicitudes exentas.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiClient,
  configureApiClient,
  errorCategory,
  isAdminAuthRequired,
  isAuthRedirectExempt,
  request,
  resetApiClientConfig,
  toApiError,
} from './apiClient';
import { MESSAGES } from './messages';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const emptyResponse = (status: number) => new Response(null, { status });
const textResponse = (status: number, text: string) => new Response(text, { status, headers: { 'Content-Type': 'text/html' } });

const fetchMock = vi.fn<typeof fetch>();
const onUnauthenticated = vi.fn();

/** Captura el error lanzado por una promesa (falla si se resuelve). */
async function caught(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    return error as ApiError;
  }
  throw new Error('La solicitud debía fallar.');
}

/** Datos de la llamada número `index` a fetch. */
function call(index = 0): { url: string; init: RequestInit } {
  const args = fetchMock.mock.calls[index];
  if (!args) throw new Error(`fetch no se llamó ${index + 1} veces`);
  return { url: String(args[0]), init: args[1] ?? {} };
}

beforeEach(() => {
  fetchMock.mockReset();
  onUnauthenticated.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  configureApiClient({ onUnauthenticated });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetApiClientConfig();
});

describe('apiClient: solicitudes', () => {
  it('usa el prefijo /api, envía las cookies de Sesión y devuelve el JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [1, 2] }));
    await expect(apiClient.get<{ data: number[] }>('/patients?page=2')).resolves.toEqual({ data: [1, 2] });
    const { url, init } = call();
    expect(url).toBe('/api/patients?page=2');
    expect(init.method).toBe('GET');
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
  });

  it('serializa el cuerpo JSON sin alterar sus valores, incluidos los espacios de una contraseña', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { ok: true }));
    const secret = ['  con', 'espacios  '].join(' ');
    await apiClient.post('/admin-authorization', { password: secret });
    const { init } = call();
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ password: secret });
  });

  it('envía FormData sin convertirlo a JSON', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, {}));
    const form = new FormData();
    form.append('nota', 'x');
    await apiClient.post('/staff/1/photo', form);
    const { init } = call();
    expect(init.body).toBe(form);
    expect(new Headers(init.headers).has('Content-Type')).toBe(false);
  });

  it('una respuesta 204 o con cuerpo vacío devuelve undefined', async () => {
    fetchMock.mockResolvedValueOnce(emptyResponse(204)).mockResolvedValueOnce(new Response('', { status: 200 }));
    await expect(apiClient.delete('/patients/1')).resolves.toBeUndefined();
    await expect(apiClient.get('/vacio')).resolves.toBeUndefined();
    expect(call(0).init.method).toBe('DELETE');
  });

  it('una respuesta exitosa que no es JSON produce un ApiError sin el contenido recibido', async () => {
    fetchMock.mockResolvedValueOnce(textResponse(200, '<html>proxy</html>'));
    const error = await caught(apiClient.get('/dashboard'));
    expect(error.kind).toBe('invalid_response');
    expect(error.message).toBe(MESSAGES.api.invalidResponse);
    expect(errorCategory(error)).toBe('server');
  });

  it('rechaza rutas absolutas, de otro origen o con el prefijo repetido, sin llamar a fetch', async () => {
    for (const path of ['http://otro.example/api/x', '//otro.example/x', 'patients', '/api/patients']) {
      await expect(request(path)).rejects.toThrow(TypeError);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiClient: errores', () => {
  it('un 400 con errors[] produce un ApiError con estado, código, mensaje y errores por campo', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        code: 'VALIDATION_ERROR',
        message: 'Los datos enviados no son válidos.',
        errors: [{ field: 'name', message: 'El nombre es obligatorio.' }, { field: 7, message: 'mal formado' }],
      }),
    );
    const error = await caught(apiClient.post('/patients', { name: '' }));
    expect(error).toMatchObject({ kind: 'http', status: 400, code: 'VALIDATION_ERROR', message: 'Los datos enviados no son válidos.' });
    expect(error.errors).toEqual([{ field: 'name', message: 'El nombre es obligatorio.' }]);
    expect(errorCategory(error)).toBe('validation');
  });

  it('conserva el mensaje en español del Backend en 403, 404, 409 y 429', async () => {
    const cases = [
      [403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', 'forbidden'],
      [404, 'NOT_FOUND', 'El registro solicitado no existe.', 'not_found'],
      [409, 'CONFLICT', 'El ID interno ya existe.', 'conflict'],
      [429, 'TOO_MANY_REQUESTS', 'Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.', 'rate_limited'],
      [403, 'PASSWORD_CHANGE_REQUIRED', 'Debes cambiar tu contraseña antes de continuar.', 'password_change_required'],
    ] as const;
    for (const [status, code, message, category] of cases) {
      fetchMock.mockResolvedValueOnce(jsonResponse(status, { code, message }));
      const error = await caught(apiClient.get('/x'));
      expect(error).toMatchObject({ status, code, message, errors: [] });
      expect(errorCategory(error)).toBe(category);
    }
  });

  it('detecta AUTORIZACION_ADMIN_REQUERIDA', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 'AUTORIZACION_ADMIN_REQUERIDA', message: 'Se requiere una autorización administrativa vigente.' }));
    const error = await caught(apiClient.get('/staff/7/documents'));
    expect(isAdminAuthRequired(error)).toBe(true);
    expect(errorCategory(error)).toBe('admin_auth_required');
    expect(isAdminAuthRequired(new ApiError({ kind: 'http', status: 403, code: 'FORBIDDEN', message: 'x' }))).toBe(false);
  });

  it('un error sin cuerpo, con HTML o con un formato desconocido usa un mensaje propio según el estado', async () => {
    fetchMock
      .mockResolvedValueOnce(emptyResponse(404))
      .mockResolvedValueOnce(textResponse(502, '<html>Bad Gateway nginx/1.2 /srv/app</html>'))
      .mockResolvedValueOnce(jsonResponse(400, { error: 'algo' }))
      .mockResolvedValueOnce(jsonResponse(500, { code: 'OTRA_COSA', message: 'Error: SQLITE_BUSY at db.ts:12' }));
    const notFound = await caught(apiClient.get('/a'));
    expect(notFound).toMatchObject({ status: 404, code: null, message: MESSAGES.api.notFound });
    const badGateway = await caught(apiClient.get('/b'));
    expect(badGateway).toMatchObject({ status: 502, code: null, message: MESSAGES.api.server });
    expect(errorCategory(badGateway)).toBe('server');
    await expect(caught(apiClient.get('/c'))).resolves.toMatchObject({ status: 400, code: null, message: MESSAGES.api.invalidData, errors: [] });
    const internal = await caught(apiClient.get('/d'));
    expect(internal.message).toBe(MESSAGES.api.server);
  });

  it('en un 500 del Backend muestra su mensaje genérico de INTERNAL_ERROR', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno. Inténtalo de nuevo más tarde.' }));
    const error = await caught(apiClient.get('/x'));
    expect(error).toMatchObject({ status: 500, code: 'INTERNAL_ERROR', message: 'Ocurrió un error interno. Inténtalo de nuevo más tarde.' });
  });

  it('un fallo de red produce un ApiError de red con estado 0 y sin el detalle técnico', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch 10.0.0.5:3000 ECONNREFUSED'));
    const error = await caught(apiClient.get('/x'));
    expect(error).toMatchObject({ kind: 'network', status: 0, code: null, message: MESSAGES.api.network });
    expect(error.message).not.toContain('ECONNREFUSED');
    expect(errorCategory(error)).toBe('network');
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('supera el tiempo máximo configurado y produce un ApiError de tiempo agotado', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const pending = caught(apiClient.get('/dashboard', { timeoutMs: 10_000 }));
    await vi.advanceTimersByTimeAsync(9_999);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await pending;
    expect(error).toMatchObject({ kind: 'timeout', status: 0, message: MESSAGES.api.timeout });
    expect(errorCategory(error)).toBe('timeout');
  });

  it('la cancelación del llamador produce un ApiError "aborted"', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const controller = new AbortController();
    const pending = caught(apiClient.get('/x', { signal: controller.signal }));
    controller.abort();
    await expect(pending).resolves.toMatchObject({ kind: 'aborted', status: 0 });
  });

  it('toApiError envuelve cualquier valor sin exponer su contenido', () => {
    const wrapped = toApiError(new Error('stack interno /srv/app.ts'));
    expect(wrapped).toMatchObject({ kind: 'unknown', status: 0, code: null, message: MESSAGES.api.unexpected });
    const original = new ApiError({ kind: 'http', status: 404, code: 'NOT_FOUND', message: 'x' });
    expect(toApiError(original)).toBe(original);
  });
});

describe('apiClient: 401', () => {
  const unauthenticated = { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.' };

  it('un 401 normal limpia al usuario y lleva a /login (manejador configurado) y lanza el ApiError', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, unauthenticated));
    const error = await caught(apiClient.get('/patients'));
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED', message: unauthenticated.message });
    expect(errorCategory(error)).toBe('unauthenticated');
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('GET /auth/me con 401 también redirige', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(401, unauthenticated));
    await caught(apiClient.get('/auth/me'));
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('login, recuperación de contraseña y POST /admin-authorization no redirigen', async () => {
    const exempt = [
      ['/auth/login', 'Credenciales incorrectas.'],
      ['/auth/forgot-password', 'Debes iniciar sesión para continuar.'],
      ['/auth/reset-password', 'Debes iniciar sesión para continuar.'],
      ['/admin-authorization', 'La contraseña es incorrecta.'],
    ] as const;
    for (const [path, message] of exempt) {
      fetchMock.mockResolvedValueOnce(jsonResponse(401, { code: 'UNAUTHENTICATED', message }));
      const error = await caught(apiClient.post(path, {}));
      expect(error).toMatchObject({ status: 401, message });
    }
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });

  it('la exención depende del método y la ruta exactos; skipAuthRedirect la activa a pedido', async () => {
    expect(isAuthRedirectExempt('POST', '/admin-authorization')).toBe(true);
    expect(isAuthRedirectExempt('GET', '/admin-authorization')).toBe(false);
    expect(isAuthRedirectExempt('DELETE', '/admin-authorization')).toBe(false);
    expect(isAuthRedirectExempt('POST', '/auth/logout')).toBe(false);
    expect(isAuthRedirectExempt('POST', '/auth/login?x=1')).toBe(true);

    fetchMock.mockResolvedValueOnce(jsonResponse(401, unauthenticated)).mockResolvedValueOnce(jsonResponse(401, unauthenticated));
    await caught(apiClient.get('/admin-authorization'));
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
    await caught(apiClient.get('/auth/me', { skipAuthRedirect: true }));
    expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  });

  it('un 403 no redirige', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { code: 'FORBIDDEN', message: 'No tienes permiso para realizar esta acción.' }));
    await caught(apiClient.get('/audit'));
    expect(onUnauthenticated).not.toHaveBeenCalled();
  });
});
