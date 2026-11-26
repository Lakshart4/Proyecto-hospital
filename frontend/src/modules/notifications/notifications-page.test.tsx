import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { jsonResponse, makeUser, mockApi, renderApp, userReply } from '../../test/appHarness';

const ALERTS = [
  { id: 'stock-1', kind: 'stock', severity: 'critical', title: 'Producto agotado', message: 'Gasas: 0 unidades.', date: '2026-12-01T08:00:00.000Z', href: '/inventario' },
  { id: 'appointment-1', kind: 'appointment', severity: 'warning', title: 'Cita próxima', message: 'Paciente de prueba: control.', date: '2026-12-02T10:00:00.000Z', href: '/citas' },
  { id: 'delivery-1', kind: 'delivery', severity: 'info', title: 'Entrega próxima', message: 'Gasas: 20 unidades solicitadas.', date: '2026-12-03T10:00:00.000Z' },
];

function mockAlerts() {
  return mockApi({
    'GET /api/auth/me': userReply(makeUser('ADMIN')),
    'GET /api/notifications': jsonResponse(200, { data: ALERTS }),
  });
}

describe('Centro de alertas', () => {
  it('muestra contadores reales y filtra por severidad y tipo', async () => {
    mockAlerts();
    renderApp('/alertas');
    await screen.findByRole('heading', { level: 1, name: 'Centro de alertas' });

    const summary = await screen.findByTestId('alerts-summary');
    expect(within(summary).getByText('Críticas').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Atención').parentElement).toHaveTextContent('1');
    expect(within(summary).getByText('Informativas').parentElement).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'Críticas' }));
    expect(screen.getByText('Producto agotado')).toBeInTheDocument();
    expect(screen.queryByText('Cita próxima')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Todas' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entregas' }));
    expect(screen.getByText('Entrega próxima')).toBeInTheDocument();
    expect(screen.queryByText('Producto agotado')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Revisar módulo' })).not.toBeInTheDocument();
  });

  it('muestra el estado vacío cuando no hay alertas', async () => {
    mockApi({
      'GET /api/auth/me': userReply(makeUser('NURSE')),
      'GET /api/notifications': jsonResponse(200, { data: [] }),
    });
    renderApp('/alertas');
    expect(await screen.findByText('No hay alertas pendientes')).toBeInTheDocument();
  });
});
