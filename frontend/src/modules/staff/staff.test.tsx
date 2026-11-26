import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MESSAGES } from '../../shared/lib/messages';
import { jsonResponse, makeUser, mockApi, renderApp, secretOf, userReply } from '../../test/appHarness';

afterEach(() => {
  vi.unstubAllGlobals();
});

const DEPARTMENTS = [
  { id: 1, name: 'Urgencias' },
  { id: 2, name: 'Cardiología' },
];

const STAFF_LIST = [
  {
    id: 10,
    internalId: 'EMP-001',
    email: 'medico1@example.com',
    role: 'DOCTOR',
    active: true,
    name: 'Dra. Elena Vargas',
    photoUrl: '/avatars/default.svg',
    position: 'Médico adscrito',
    description: 'Urgencias generales',
    specialty: 'Medicina de urgencias',
    departmentId: 1,
    department: { id: 1, name: 'Urgencias' },
    yearsExperience: 8,
    shift: 'matutino',
    phone: '555-0101',
    birthDate: '1988-05-12',
  },
];

const STAFF_DETAIL = {
  ...STAFF_LIST[0],
  schedule: [
    {
      dayOfWeek: 1,
      startTime: '08:00',
      endTime: '16:00',
      mealStart: '12:00',
      mealEnd: '12:30',
      breaks: [{ startTime: '10:00', endTime: '10:15' }],
    },
  ],
};

describe('Módulo de Personal y Perfil (6.5 y 6.6)', () => {
  it('lista personal para ADMIN, aplica filtros y exige ConfirmDialog antes de eliminar', async () => {
    const api = mockApi({
      'GET /api/auth/me': userReply(makeUser('ADMIN')),
      'GET /api/departments': jsonResponse(200, { data: DEPARTMENTS }),
      'GET /api/staff': jsonResponse(200, { data: STAFF_LIST }),
      'DELETE /api/staff/10': new Response(null, { status: 204 }),
    });

    renderApp('/personal');
    expect(await screen.findByText('Dra. Elena Vargas')).toBeInTheDocument();
    expect(screen.getByText('EMP-001')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.documents.deleteButton }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(api.count('DELETE', '/staff/10')).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.common.confirm }));
    await waitFor(() => expect(api.count('DELETE', '/staff/10')).toBe(1));
  });

  it('crea un empleado y muestra la contraseña inicial generada una sola vez; valida sin enviar campos vacíos', async () => {
    const api = mockApi({
      'GET /api/auth/me': userReply(makeUser('ADMIN')),
      'GET /api/departments': jsonResponse(200, { data: DEPARTMENTS }),
      'POST /api/staff': jsonResponse(201, { data: STAFF_DETAIL, initialPassword: 'TempPass99Xy' }),
    });

    renderApp('/personal/nuevo');
    await screen.findByLabelText(/ID interno/);

    // Envío con campos vacíos: no dispara POST
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.staff.createSubmit }));
    expect(await screen.findAllByText(MESSAGES.validation.required)).not.toHaveLength(0);
    expect(api.count('POST', '/staff')).toBe(0);

    fireEvent.change(screen.getByLabelText(/ID interno/), { target: { value: 'EMP-099' } });
    fireEvent.change(screen.getByLabelText(/Nombre completo/), { target: { value: 'Dr. Marcos Silva' } });
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'marcos@example.com' } });
    fireEvent.change(screen.getByLabelText(/Cargo/), { target: { value: 'Médico' } });
    fireEvent.change(screen.getByLabelText(/Especialidad/), { target: { value: 'Cardiología' } });
    fireEvent.change(screen.getByLabelText(/Teléfono/), { target: { value: '555-9999' } });

    fireEvent.click(screen.getByRole('button', { name: MESSAGES.staff.createSubmit }));
    expect(await screen.findByText('TempPass99Xy')).toBeInTheDocument();
    expect(api.count('POST', '/staff')).toBe(1);
  });

  it('en /personal/:id pestaña Documentos abre AdminAuthDialog ante AUTORIZACION_ADMIN_REQUERIDA y repite la solicitud', async () => {
    const adminPass = secretOf('admin', 'valida');
    const api = mockApi({
      'GET /api/auth/me': userReply(makeUser('ADMIN')),
      'GET /api/departments': jsonResponse(200, { data: DEPARTMENTS }),
      'GET /api/staff/10': jsonResponse(200, { data: STAFF_DETAIL }),
      'GET /api/staff/10/documents': [
        jsonResponse(403, { code: 'AUTORIZACION_ADMIN_REQUERIDA', message: 'Se requiere autorización.' }),
        jsonResponse(200, {
          data: [
            {
              id: 5,
              userId: 10,
              type: 'acreditación',
              title: 'Cédula Profesional',
              issuedAt: '2024-01-01',
              expiresAt: '2025-01-01',
              fileSize: 1024,
              expired: true,
              createdAt: '2024-01-01T00:00:00Z',
              updatedAt: '2024-01-01T00:00:00Z',
            },
          ],
        }),
      ],
      'POST /api/admin-authorization': jsonResponse(201, { expiresAt: new Date(Date.now() + 600_000).toISOString() }),
    });

    renderApp('/personal/10');
    await screen.findByRole('heading', { level: 2, name: 'Dra. Elena Vargas' });
    fireEvent.click(screen.getByRole('tab', { name: MESSAGES.staff.tabs.documents }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Contraseña del Administrador/), { target: { value: adminPass } });
    fireEvent.click(screen.getByRole('button', { name: MESSAGES.adminAuth.submit }));

    expect(await screen.findByText('Cédula Profesional')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.documents.expiredBadge)).toBeInTheDocument();
    expect(api.count('GET', '/staff/10/documents')).toBe(2);
  });

  it('un Médico abre /perfil y /perfil/documentos en modo solo lectura con insignia Vencido', async () => {
    const doctor = makeUser('DOCTOR', { id: 10 });
    mockApi({
      'GET /api/auth/me': userReply(doctor),
      'GET /api/staff/10': jsonResponse(200, { data: STAFF_DETAIL }),
      'GET /api/me/documents': jsonResponse(200, {
        data: [
          {
            id: 1,
            userId: 10,
            type: 'contratación',
            title: 'Contrato Vigente',
            issuedAt: '2025-01-01',
            expiresAt: null,
            fileSize: 500,
            expired: false,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
          },
          {
            id: 2,
            userId: 10,
            type: 'acreditación',
            title: 'Certificado Vencido',
            issuedAt: '2024-01-01',
            expiresAt: '2024-06-01',
            fileSize: 600,
            expired: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      }),
    });

    const first = renderApp('/perfil');
    expect(await screen.findByText('Dra. Elena Vargas')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: MESSAGES.staff.viewOwnDocuments })).toHaveAttribute('href', '/perfil/documentos');
    first.unmount();

    renderApp('/perfil/documentos');
    expect(await screen.findByText('Contrato Vigente')).toBeInTheDocument();
    expect(screen.getByText('Certificado Vencido')).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.documents.expiredBadge)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.documents.uploadButton })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MESSAGES.documents.deleteButton })).not.toBeInTheDocument();
  });
});
