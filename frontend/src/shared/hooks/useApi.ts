import { useCallback, useEffect, useLayoutEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError, toApiError } from '../lib/apiClient';

export interface UseApiResult<T> {
  /** Datos de la última carga exitosa; `null` mientras no hay datos o si la última carga falló. */
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  /** Vuelve a ejecutar la carga. */
  reload: () => void;
}

export interface UseApiOptions {
  /** Con `false` no se carga nada (por ejemplo, mientras falta un parámetro). Por defecto `true`. */
  enabled?: boolean;
}

/**
 * Carga datos de la API al montar y cada vez que cambian `deps` (Req. 13.5, 15.11, 15.12).
 * Cancela la solicitud anterior al cambiar `deps` o al desmontar, e ignora sus resultados. Si la carga
 * falla, `data` queda en `null` para no mostrar valores parciales (Req. 4.6).
 */
export function useApi<T>(loader: (signal: AbortSignal) => Promise<T>, deps: DependencyList, options: UseApiOptions = {}): UseApiResult<T> {
  const enabled = options.enabled ?? true;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [reloadToken, setReloadToken] = useState(0);

  // Siempre se usa la versión más reciente del cargador sin incluirlo en las dependencias.
  // useLayoutEffect corre antes que useEffect, así la carga usa el cargador del último render.
  const loaderRef = useRef(loader);
  useLayoutEffect(() => {
    loaderRef.current = loader;
  });

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    loaderRef.current(controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setLoading(false);
      },
      (reason: unknown) => {
        if (controller.signal.aborted) return;
        setData(null);
        setError(toApiError(reason));
        setLoading(false);
      },
    );
    return () => controller.abort();
    // `deps` lo define el llamador, igual que en useEffect.
  }, [enabled, reloadToken, ...deps]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);

  return { data, error, loading, reload };
}
