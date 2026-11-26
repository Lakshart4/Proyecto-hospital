// Utilidades de prueba: monta las rutas reales de la aplicación en memoria y simula la API con fetch.

import { act, render, type RenderResult } from '@testing-library/react';
import { StrictMode } from 'react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { appRoutes } from '../app/router';
import type { Role } from '../app/permissions';
import type { AuthUser } from '../shared/hooks/useAuth';

export const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
export const emptyResponse = (status = 204) => new Response(null, { status });

export const UNAUTHENTICATED = { code: 'UNAUTHENTICATED', message: 'Debes iniciar sesión para continuar.' };

const NAMES: Record<Role, string> = {
  ADMIN: 'Directora Ficticia',
  DOCTOR: 'Médico Ficticio',
  NURSE: 'Enfermera Ficticia',
  CLEANING: 'Limpieza Ficticia',
};

export function makeUser(role: Role, overrides: Partial<AuthUser> = {}): AuthUser {
  return { id: 7, email: `${role.toLowerCase()}@example.com`, name: NAMES[role], role, mustChangePassword: false, ...overrides };
}

export type Reply = Response | Promise<Response> | ((body: unknown) => Response | Promise<Response>);

export interface RecordedCall {
  method: string;
  url: string;
  body: unknown;
  credentials: RequestCredentials | undefined;
}

/**
 * fetch simulado: cada clave `MÉTODO /api/ruta` tiene una lista de respuestas que se consumen en orden
 * (la última se repite). Una ruta sin respuesta produce un fallo de red.
 */
export function mockApi(initial: Record<string, Reply | Reply[]> = {}) {
  const replies = new Map<string, Reply[]>();
  const calls: RecordedCall[] = [];
  const on = (key: string, reply: Reply | Reply[]) => replies.set(key, Array.isArray(reply) ? [...reply] : [reply]);
  for (const [key, reply] of Object.entries(initial)) on(key, reply);

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const method = init?.method ?? 'GET';
    const url = String(input);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, url, body, credentials: init?.credentials });
    const queue = replies.get(`${method} ${url.split('?')[0]}`);
    if (!queue || queue.length === 0) throw new TypeError('Failed to fetch');
    const next = queue.length > 1 ? queue.shift()! : queue[0]!;
    const response = typeof next === 'function' ? next(body) : next;
    // Cada llamada recibe una copia: el cuerpo de un Response solo puede leerse una vez.
    return (await response).clone();
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    fetchMock,
    calls,
    on,
    count: (method: string, path: string) => calls.filter((c) => c.method === method && c.url === `/api${path}`).length,
  };
}

/** Respuesta de `/auth/me` o `/auth/login` para un usuario. */
export const userReply = (user: AuthUser) => jsonResponse(200, { user });

export function renderApp(initialPath: string, options: { strict?: boolean } = {}): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const router = createMemoryRouter(appRoutes, { initialEntries: [initialPath] });
  const tree = <RouterProvider router={router} />;
  const result = render(options.strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { ...result, router };
}

/** Navega con el enrutador dentro de act. */
export async function navigateTo(router: ReturnType<typeof createMemoryRouter>, path: string) {
  await act(async () => {
    await router.navigate(path);
  });
}

/** Valor de prueba armado en tiempo de ejecución (no hay contraseñas literales en el repositorio). */
export const secretOf = (...parts: string[]) => parts.join(' ');
