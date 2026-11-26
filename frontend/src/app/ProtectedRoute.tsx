import type { ReactNode } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';
import { MESSAGES } from '../shared/lib/messages';
import { Spinner } from '../shared/components/Spinner';
import { CHANGE_PASSWORD_PATH, LOGIN_PATH, destinationAfterLogin, homeFor, normalizePath } from './navigation';

/** Pantalla mientras se consulta `/auth/me`. */
export function SessionLoader() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-page p-6 text-center">
      <h1 className="text-2xl font-semibold text-heading">{MESSAGES.app.name}</h1>
      <Spinner label={MESSAGES.auth.loadingSession} />
    </main>
  );
}

/**
 * Exige Sesión (Req. 1.6). Sin Sesión lleva a `/login` recordando la ruta pedida. Con un cambio de
 * contraseña pendiente solo permite `/cambiar-contrasena` (Req. 5.12).
 */
export function ProtectedRoute() {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <SessionLoader />;
  if (user === null) {
    return <Navigate to={LOGIN_PATH} replace state={{ from: `${location.pathname}${location.search}` }} />;
  }
  if (user.mustChangePassword && normalizePath(location.pathname) !== CHANGE_PASSWORD_PATH) {
    return <Navigate to={CHANGE_PASSWORD_PATH} replace />;
  }
  return <Outlet />;
}

/** Páginas solo para visitantes (inicio de sesión): con Sesión se va al destino que corresponde. */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();
  if (status === 'loading') return <SessionLoader />;
  if (user !== null) return <Navigate to={destinationAfterLogin(user, location.state)} replace />;
  return <>{children}</>;
}

/** `/` lleva a la página de inicio del rol. */
export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? homeFor(user.role) : LOGIN_PATH} replace />;
}
