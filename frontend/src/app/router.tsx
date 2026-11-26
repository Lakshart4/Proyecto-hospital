import { Outlet, createBrowserRouter, type RouteObject } from 'react-router-dom';
import { ChangePasswordPage } from '../modules/auth/ChangePasswordPage';
import { ForgotPasswordPage } from '../modules/auth/ForgotPasswordPage';
import { LoginPage } from '../modules/auth/LoginPage';
import { ResetPasswordPage } from '../modules/auth/ResetPasswordPage';
import { AppointmentsPage } from '../modules/appointments';
import { DashboardPage } from '../modules/dashboard';
import { InventoryPage, ProductDetailPage } from '../modules/inventory';
import { NotificationsPage } from '../modules/notifications/NotificationsPage';
import { PatientCreatePage, PatientDetailPage, PatientsListPage } from '../modules/patients';
import { ReportsPage } from '../modules/reports';
import { RoomsListPage } from '../modules/rooms';
import { PrivateDocumentsPage } from '../modules/staff/pages/PrivateDocumentsPage';
import { ProfilePage } from '../modules/staff/pages/ProfilePage';
import { StaffCreatePage } from '../modules/staff/pages/StaffCreatePage';
import { StaffDetailPage } from '../modules/staff/pages/StaffDetailPage';
import { StaffListPage } from '../modules/staff/pages/StaffListPage';
import { Layout } from '../shared/components/Layout';
import { AuthProvider } from './AuthProvider';
import { CHANGE_PASSWORD_PATH, FORGOT_PASSWORD_PATH, LOGIN_PATH, RESET_PASSWORD_PATH, SECTIONS, type Section } from './navigation';
import { NotFoundPage, PlaceholderPage } from './PlaceholderPage';
import { HomeRedirect, ProtectedRoute, PublicOnlyRoute } from './ProtectedRoute';
import { RoleGuard } from './RoleGuard';

function sectionRoutes(section: Section): RouteObject {
  if (section.id === 'dashboard') {
    return { element: <RoleGuard section={section} />, children: [{ path: '/dashboard', element: <DashboardPage /> }] };
  }
  if (section.id === 'reports') {
    return { element: <RoleGuard section={section} />, children: [{ path: '/reportes', element: <ReportsPage /> }] };
  }
  if (section.id === 'notifications') {
    return { element: <RoleGuard section={section} />, children: [{ path: '/alertas', element: <NotificationsPage /> }] };
  }
  if (section.id === 'patients') {
    return {
      element: <RoleGuard section={section} />,
      children: [
        { path: '/pacientes', element: <PatientsListPage /> },
        { path: '/pacientes/nuevo', element: <PatientCreatePage /> },
        { path: '/pacientes/:id', element: <PatientDetailPage /> },
      ],
    };
  }
  if (section.id === 'appointments') {
    return { element: <RoleGuard section={section} />, children: [{ path: '/citas', element: <AppointmentsPage /> }] };
  }
  if (section.id === 'inventory') {
    return {
      element: <RoleGuard section={section} />,
      children: [
        { path: '/inventario', element: <InventoryPage /> },
        { path: '/inventario/:id', element: <ProductDetailPage /> },
      ],
    };
  }
  if (section.id === 'rooms') {
    return { element: <RoleGuard section={section} />, children: [{ path: '/habitaciones', element: <RoomsListPage /> }] };
  }
  if (section.id === 'staff') {
    return {
      element: <RoleGuard section={section} />,
      children: [
        { path: '/personal', element: <StaffListPage /> },
        { path: '/personal/nuevo', element: <StaffCreatePage /> },
        { path: '/personal/:id', element: <StaffDetailPage /> },
      ],
    };
  }
  if (section.id === 'ownProfile') {
    return {
      element: <RoleGuard section={section} />,
      children: [{ path: '/perfil', element: <ProfilePage /> }],
    };
  }
  if (section.id === 'ownDocuments') {
    return {
      element: <RoleGuard section={section} />,
      children: [{ path: '/perfil/documentos', element: <PrivateDocumentsPage /> }],
    };
  }
  const page = <PlaceholderPage title={section.label} />;
  const children: RouteObject[] = [{ path: section.path, element: page }];
  if (section.nested) children.push({ path: `${section.path}/*`, element: page });
  return { element: <RoleGuard section={section} />, children };
}

export const appRoutes: RouteObject[] = [
  {
    element: (
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    ),
    children: [
      {
        path: LOGIN_PATH,
        element: (
          <PublicOnlyRoute>
            <LoginPage />
          </PublicOnlyRoute>
        ),
      },
      { path: FORGOT_PASSWORD_PATH, element: <ForgotPasswordPage /> },
      { path: RESET_PASSWORD_PATH, element: <ResetPasswordPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <Layout />,
            children: [
              { index: true, element: <HomeRedirect /> },
              { path: CHANGE_PASSWORD_PATH, element: <ChangePasswordPage /> },
              ...SECTIONS.map(sectionRoutes),
              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];

export function createAppRouter() {
  return createBrowserRouter(appRoutes);
}
