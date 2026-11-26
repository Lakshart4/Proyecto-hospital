// Pruebas de los componentes compartidos (tarea 5.6): renderizado, accesibilidad básica e interacción.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Avatar, DEFAULT_AVATAR_SRC } from './Avatar';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable, type DataTableColumn } from './DataTable';
import { ErrorBanner } from './ErrorBanner';
import { FormField, INPUT_CLASSES } from './FormField';
import { Modal } from './Modal';
import { ProgressBar } from './ProgressBar';
import { SearchBox } from './SearchBox';
import { Spinner } from './Spinner';
import { StatCard } from './StatCard';
import { StatusBadge } from './StatusBadge';
import { Tabs } from './Tabs';
import { Toast } from './Toast';

type Row = { id: number; name: string; age: number };
const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'Nombre', sortValue: (r) => r.name },
  { key: 'age', header: 'Edad', sortValue: (r) => r.age },
  { key: 'actions', header: 'Acciones', render: (r) => <span>acción {r.id}</span> },
];
const makeRows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Persona ${String.fromCharCode(90 - i)}`, age: (i * 7) % 50 }));
const bodyRows = () => screen.getAllByRole('row').slice(1);

describe('Button', () => {
  it('queda deshabilitado mientras carga, muestra el indicador y no ejecuta el clic', () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Guardar</Button>);
    const button = screen.getByRole('button', { name: 'Guardar' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    rerender(<Button onClick={onClick} loading>Guardar</Button>);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(within(button).getByRole('status')).toHaveTextContent('Cargando…');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('Modal y ConfirmDialog', () => {
  it('Modal tiene rol dialog con título y se cierra con Escape o con "Cerrar"', () => {
    const onClose = vi.fn();
    const { rerender } = render(<Modal open={false} title="Título" onClose={onClose}>Contenido</Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
    rerender(<Modal open title="Título" onClose={onClose}>Contenido</Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Título' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.className).toMatch(/duration-200/);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('ConfirmDialog solo ejecuta la acción con "Confirmar"; "Cancelar" no la ejecuta', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog open message="¿Eliminar el registro?" onConfirm={onConfirm} onCancel={onCancel} />);
    expect(screen.getByRole('dialog', { name: 'Confirmar acción' })).toHaveTextContent('¿Eliminar el registro?');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ConfirmDialog en carga deshabilita ambos botones', () => {
    render(<ConfirmDialog open message="x" onConfirm={vi.fn()} onCancel={vi.fn()} loading />);
    expect(screen.getByRole('button', { name: /Confirmar/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  });
});

describe('DataTable', () => {
  it('está dentro de un contenedor con overflow-x-auto y muestra el mensaje vacío', () => {
    const { container } = render(<DataTable caption="Personas" columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
    expect(screen.getByText('No hay resultados.')).toBeInTheDocument();
  });

  it('ordena por columna y alterna la dirección con aria-sort', () => {
    const rows = [
      { id: 1, name: 'Carla', age: 40 },
      { id: 2, name: 'ana', age: 9 },
      { id: 3, name: 'Beto', age: 10 },
    ];
    render(<DataTable caption="Personas" columns={columns} rows={rows} rowKey={(r) => r.id} />);
    const header = screen.getByRole('columnheader', { name: /Edad/ });
    expect(header).toHaveAttribute('aria-sort', 'none');
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Edad' }));
    expect(header).toHaveAttribute('aria-sort', 'ascending');
    expect(bodyRows().map((r) => r.textContent)).toEqual(['ana9acción 2', 'Beto10acción 3', 'Carla40acción 1']);
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Edad' }));
    expect(header).toHaveAttribute('aria-sort', 'descending');
    expect(bodyRows()[0]).toHaveTextContent('Carla');
    expect(screen.getByRole('columnheader', { name: 'Acciones' })).not.toHaveAttribute('aria-sort');
  });

  it('pagina de 10 en 10 con "Anterior" y "Siguiente" y vuelve a la primera página al reordenar', () => {
    render(<DataTable caption="Personas" columns={columns} rows={makeRows(23)} rowKey={(r) => r.id} />);
    expect(bodyRows()).toHaveLength(10);
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
    expect(bodyRows()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ordenar por Nombre' }));
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
  });
});

describe('FormField y SearchBox', () => {
  it('FormField enlaza etiqueta, control y error', () => {
    render(
      <FormField id="nombre" label="Nombre" error="Este campo es obligatorio." required>
        <input className={INPUT_CLASSES} />
      </FormField>,
    );
    const input = screen.getByLabelText(/Nombre/);
    expect(input).toHaveAttribute('id', 'nombre');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', 'nombre-error');
    expect(input).toHaveAccessibleDescription('Este campo es obligatorio.');
  });

  it('FormField sin error no marca el control como inválido', () => {
    render(
      <FormField id="tel" label="Teléfono" hint="Solo números">
        <input />
      </FormField>,
    );
    const input = screen.getByLabelText('Teléfono');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).toHaveAccessibleDescription('Solo números');
  });

  it('SearchBox tiene etiqueta accesible y notifica el texto', () => {
    function Wrapper() {
      const [value, setValue] = useState('');
      return (
        <>
          <SearchBox value={value} onChange={setValue} />
          <output>{value}</output>
        </>
      );
    }
    render(<Wrapper />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar' }), { target: { value: 'ana' } });
    expect(screen.getByRole('status')).toHaveTextContent('ana');
  });
});

describe('StatusBadge, StatCard, ProgressBar, Tabs', () => {
  it('StatusBadge muestra el texto y el color de su tono', () => {
    render(<StatusBadge value="fallecido" />);
    const badge = screen.getByText('fallecido');
    expect(badge).toHaveAttribute('data-tone', 'danger');
    expect(badge.className).toContain('bg-status-danger-bg');
  });

  it('StatCard muestra ícono, etiqueta y valor', () => {
    const { container } = render(<StatCard label="Pacientes activos" value={12} icon={Stethoscope} />);
    expect(screen.getByText('Pacientes activos')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('ProgressBar muestra el porcentaje en texto y lo limita a 0–100', () => {
    const { rerender } = render(<ProgressBar label="Urgencias" value={66.6} />);
    const bar = screen.getByRole('progressbar', { name: 'Urgencias' });
    expect(bar).toHaveAttribute('aria-valuenow', '67');
    expect(screen.getByText('67 %')).toBeInTheDocument();
    rerender(<ProgressBar label="Urgencias" value={140} />);
    expect(screen.getByText('100 %')).toBeInTheDocument();
    rerender(<ProgressBar label="Urgencias" value={-3} />);
    expect(screen.getByText('0 %')).toBeInTheDocument();
  });

  it('Tabs marca la pestaña activa, muestra contadores y notifica el cambio', () => {
    const onChange = vi.fn();
    render(<Tabs label="Pacientes" tabs={[{ id: 'a', label: 'Activos', count: 3 }, { id: 'b', label: 'Dados de alta', count: 0 }]} active="a" onChange={onChange} />);
    expect(screen.getByRole('tab', { name: 'Activos (3)' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Dados de alta (0)' }));
    expect(onChange).toHaveBeenCalledWith('b');
  });
});

describe('Spinner, Toast, ErrorBanner, Avatar', () => {
  it('Spinner se anuncia como estado con texto en español', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
  });

  it('Toast se cierra con el botón y automáticamente tras la duración', () => {
    vi.useFakeTimers();
    try {
      const onClose = vi.fn();
      render(<Toast message="Guardado" onClose={onClose} durationMs={3000} />);
      expect(screen.getByRole('status')).toHaveTextContent('Guardado');
      fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
      expect(onClose).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(3000);
      expect(onClose).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('ErrorBanner es una alerta con título, mensaje y botón opcional para descartar', () => {
    const onDismiss = vi.fn();
    render(<ErrorBanner message="No se pudo guardar." onDismiss={onDismiss} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Ocurrió un problema');
    expect(alert).toHaveTextContent('No se pudo guardar.');
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('Avatar usa la imagen por defecto sin foto o si la foto no carga', () => {
    const { rerender } = render(<Avatar alt="Ana" />);
    expect(screen.getByRole('img', { name: 'Ana' })).toHaveAttribute('src', DEFAULT_AVATAR_SRC);
    rerender(<Avatar alt="Ana" src="/uploads/ana.jpg" />);
    const img = screen.getByRole('img', { name: 'Ana' });
    expect(img).toHaveAttribute('src', '/uploads/ana.jpg');
    fireEvent.error(img);
    expect(img).toHaveAttribute('src', DEFAULT_AVATAR_SRC);
    expect(img.className).toContain('rounded-full');
  });
});
