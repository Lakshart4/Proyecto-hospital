// Sesión del Frontend (Req. 1.1, 1.4, 1.6, 2.8, 5.12).
//
// - Al montar consulta `GET /auth/me` una sola vez (también con StrictMode, que repite los efectos) y sin la
//   redirección automática del cliente: un 401 en esa primera consulta solo significa "sin Sesión" y deja
//   que las rutas protegidas lleven a `/login`, sin ciclos.
// - Reemplaza el manejador de 401 del cliente API: ante un 401 de una petición normal limpia al usuario y
//   navega a `/login` con React Router, sin recargar la página. Las peticiones exentas del cliente (login,
//   recuperación y `POST /admin-authorization`) no llegan a este manejador; `useAdminAuth` distingue la
//   contraseña administrativa incorrecta de la Sesión expirada consultando `/auth/me`.
// - Ni el usuario ni las contraseñas se guardan en localStorage o sessionStorage; la Sesión es la cookie
//   HttpOnly que el navegador envía.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext, type AuthContextValue, type AuthStatus, type AuthUser } from '../shared/hooks/useAuth';
import { apiClient, configureApiClient, resetApiClientConfig } from '../shared/lib/apiClient';
import { LOGIN_PATH, PUBLIC_PATHS, normalizePath } from './navigation';
import { isRole } from './permissions';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
}

const SIGNED_OUT: AuthState = { status: 'unauthenticated', user: null };

/** Valida la forma de `{ user }` que responde el Backend; `null` si no la tiene. */
export function parseAuthUser(body: unknown): AuthUser | null {
  if (typeof body !== 'object' || body === null) return null;
  const user = (body as { user?: unknown }).user;
  if (typeof user !== 'object' || user === null) return null;
  const u = user as Record<string, unknown>;
  if (
    typeof u.id !== 'number' ||
    typeof u.email !== 'string' ||
    typeof u.name !== 'string' ||
    !isRole(u.role) ||
    typeof u.mustChangePassword !== 'boolean'
  ) {
    return null;
  }
  return { id: u.id, email: u.email, name: u.name, role: u.role, mustChangePassword: u.mustChangePassword };
}

/** Estado tras la consulta inicial: cualquier fallo (401, red, respuesta inválida) deja la app sin Sesión. */
async function loadInitialSession(): Promise<AuthState> {
  try {
    const user = parseAuthUser(await apiClient.get<unknown>('/auth/me', { skipAuthRedirect: true }));
    return user ? { status: 'authenticated', user } : SIGNED_OUT;
  } catch {
    return SIGNED_OUT;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });
  const navigate = useNavigate();
  const location = useLocation();

  // Valores actuales para el manejador de 401, que se registra una sola vez.
  const navigateRef = useRef(navigate);
  const pathRef = useRef(location.pathname);
  useLayoutEffect(() => {
    navigateRef.current = navigate;
    pathRef.current = location.pathname;
  });

  const goToLogin = useCallback(() => {
    const current = pathRef.current;
    if (PUBLIC_PATHS.includes(normalizePath(current))) return;
    navigateRef.current(LOGIN_PATH, { replace: true, state: { from: current } });
  }, []);

  useEffect(() => {
    configureApiClient({
      onUnauthenticated: () => {
        setState(SIGNED_OUT);
        goToLogin();
      },
    });
    return () => resetApiClientConfig();
  }, [goToLogin]);

  // Una sola consulta inicial aunque el efecto se ejecute dos veces.
  const initialRequest = useRef<Promise<AuthState> | null>(null);
  useEffect(() => {
    let active = true;
    initialRequest.current ??= loadInitialSession();
    void initialRequest.current.then((result) => {
      if (active) setState((current) => (current.status === 'loading' ? result : current));
    });
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email: string, password: string): Promise<AuthUser> => {
    // Se envían tal cual: el Backend recorta el correo y la contraseña nunca se modifica.
    const user = parseAuthUser(await apiClient.post<unknown>('/auth/login', { email, password }));
    if (user === null) throw new TypeError('Respuesta de inicio de sesión sin usuario.');
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Si la Sesión ya no existía (401) el cliente ya llevó a /login; ante otro fallo se cierra igual en el navegador.
    }
    setState(SIGNED_OUT);
    navigateRef.current(LOGIN_PATH, { replace: true });
  }, []);

  const refresh = useCallback(async (): Promise<AuthUser | null> => {
    const user = parseAuthUser(await apiClient.get<unknown>('/auth/me'));
    setState(user ? { status: 'authenticated', user } : SIGNED_OUT);
    return user;
  }, []);

  const updateUser = useCallback<AuthContextValue['updateUser']>((changes) => {
    setState((current) => (current.user ? { status: 'authenticated', user: { ...current.user, ...changes } } : current));
  }, []);

  const clearUser = useCallback(() => setState(SIGNED_OUT), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status: state.status, user: state.user, login, logout, refresh, updateUser, clearUser }),
    [state, login, logout, refresh, updateUser, clearUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
