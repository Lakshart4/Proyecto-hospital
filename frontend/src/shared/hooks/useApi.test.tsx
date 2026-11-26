// Pruebas de useApi (tarea 5.3): carga, error sin datos parciales, recarga y cancelación.

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/apiClient';
import { MESSAGES } from '../lib/messages';
import { useApi } from './useApi';

/** Promesa controlable desde la prueba. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useApi', () => {
  it('indica la carga y luego entrega los datos', async () => {
    const pending = deferred<number[]>();
    const { result } = renderHook(() => useApi(() => pending.promise, []));
    expect(result.current).toMatchObject({ loading: true, data: null, error: null });
    await act(async () => pending.resolve([1, 2]));
    expect(result.current).toMatchObject({ loading: false, data: [1, 2], error: null });
  });

  it('si la recarga falla, quita los datos anteriores (sin valores parciales) y expone el ApiError', async () => {
    const failure = new ApiError({ kind: 'timeout', status: 0, code: null, message: MESSAGES.api.timeout });
    const loader = vi.fn<(signal: AbortSignal) => Promise<string>>().mockResolvedValueOnce('primero').mockRejectedValueOnce(failure);
    const { result } = renderHook(() => useApi(loader, []));
    await waitFor(() => expect(result.current.data).toBe('primero'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.error).toBe(failure));
    expect(result.current).toMatchObject({ loading: false, data: null });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('convierte un error que no es ApiError en un mensaje genérico', async () => {
    const { result } = renderHook(() => useApi(() => Promise.reject(new Error('detalle interno')), []));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe(MESSAGES.api.unexpected);
  });

  it('al cambiar las dependencias cancela la solicitud anterior e ignora su resultado', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const signals: AbortSignal[] = [];
    const { result, rerender } = renderHook(({ id }: { id: number }) =>
      useApi((signal) => {
        signals.push(signal);
        return id === 1 ? first.promise : second.promise;
      }, [id]),
      { initialProps: { id: 1 } },
    );
    rerender({ id: 2 });
    expect(signals[0]?.aborted).toBe(true);
    await act(async () => second.resolve('dos'));
    await act(async () => first.resolve('uno'));
    expect(result.current.data).toBe('dos');
  });

  it('cancela al desmontar y no carga mientras enabled es false', () => {
    const signals: AbortSignal[] = [];
    const loader = (signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<never>(() => undefined);
    };
    const { unmount } = renderHook(() => useApi(loader, []));
    unmount();
    expect(signals[0]?.aborted).toBe(true);

    const disabled = vi.fn(loader);
    const { result } = renderHook(() => useApi(disabled, [], { enabled: false }));
    expect(disabled).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
  });
});
