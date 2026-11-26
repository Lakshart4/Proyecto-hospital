import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../shared/hooks/useAuth';
import { LOGIN_PATH, canOpenSection, homeFor, type RedirectState, type Section } from './navigation';

/**
 * Permite la sección solo a los roles de la matriz (Req. 2.9). Si el rol no puede abrirla, redirige de
 * inmediato (en el mismo render, muy por debajo de 1 s) a su página de inicio, donde el Layout muestra
 * el aviso "Acceso denegado".
 */
export function RoleGuard({ section }: { section: Section }) {
  const { user } = useAuth();
  if (user === null) return <Navigate to={LOGIN_PATH} replace />;
  if (!canOpenSection(user.role, section)) {
    const state: RedirectState = { accessDenied: true };
    return <Navigate to={homeFor(user.role)} replace state={state} />;
  }
  return <Outlet />;
}
