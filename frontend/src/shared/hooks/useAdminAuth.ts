// Autorización_Administrativa desde el Frontend (Req. 18.1, 18.3, 18.4, 18.8, 18.9).
//
// `withAdminAuth(solicitud)` ejecuta la solicitud; si el Backend responde 403 AUTORIZACION_ADMIN_REQUERIDA,
// abre `AdminAuthDialog`, espera la autorización y repite la solicitud original una sola vez.
//
// `POST /admin-authorization` no redirige automáticamente ante un 401 (ver apiClient), porque el Backend usa
// el mismo código UNAUTHENTICATED para la contraseña incorrecta y para la Sesión expirada. Para distinguirlos
// se consulta `GET /auth/me`: si responde, la Sesión sigue activa y el error se muestra en el diálogo; si
// responde 401, el cliente ya limpió al usuario y llevó a `/login`, y el diálogo se cierra.
//
// La contraseña solo vive en el estado del formulario del diálogo mientras está abierto y se envía tal cual;
// no se guarda en ningún almacenamiento ni aquí. El token de la autorización es una cookie HttpOnly que el
// Frontend nunca lee.

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, isAdminAuthRequired, toApiError, type ApiError } from '../lib/apiClient';
import { formatTime } from '../lib/formatters';
import { MESSAGES } from '../lib/messages';

const MAX_TIMEOUT_MS = 2_147_483_647;

export interface AdminAuthorizationResponse {
  expiresAt: string;
}

interface Waiter {
  resolve: () => void;
  reject: (error: ApiError) => void;
  original: ApiError;
}

/** Propiedades que `AdminAuthDialog` recibe del hook. */
export interface AdminAuthDialogBinding {
  open: boolean;
  submitting: boolean;
  error: string | null;
  onSubmit: (password: string) => void;
  onCancel: () => void;
  /** Aviso con la hora de vencimiento tras autorizar. */
  notice: string | null;
  onNoticeClose: () => void;
}

export interface UseAdminAuthResult {
  withAdminAuth: <T>(run: () => Promise<T>) => Promise<T>;
  /** Vencimiento de la autorización vigente otorgada en esta pantalla, o `null`. */
  expiresAt: Date | null;
  /** Revoca la autorización de la Sesión (`DELETE /admin-authorization`). */
  revoke: () => Promise<void>;
  dialog: AdminAuthDialogBinding;
}

/** `true` si la Sesión principal sigue activa. Un 401 aquí dispara la redirección normal a `/login`. */
async function sessionIsActive(): Promise<boolean> {
  try {
    await apiClient.get<unknown>('/auth/me');
    return true;
  } catch (error) {
    // Ante un fallo de red no hay evidencia de que la Sesión expiró: se muestra el error del diálogo.
    return toApiError(error).status !== 401;
  }
}

export function useAdminAuth(): UseAdminAuthResult {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const waitersRef = useRef<Waiter[]>([]);
  // Bloqueo síncrono contra envíos duplicados (el estado de React se actualiza después).
  const submittingRef = useRef(false);

  const settle = useCallback((outcome: { ok: true } | { ok: false; error?: ApiError }) => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    setOpen(false);
    setError(null);
    for (const waiter of waiters) {
      if (outcome.ok) waiter.resolve();
      else waiter.reject(outcome.error ?? waiter.original);
    }
  }, []);

  // Al desmontar, las solicitudes en espera terminan con su error original.
  useEffect(
    () => () => {
      const waiters = waitersRef.current;
      waitersRef.current = [];
      for (const waiter of waiters) waiter.reject(waiter.original);
    },
    [],
  );

  // La autorización vence a los 10 minutos; el Backend es quien la hace cumplir (Req. 18.8).
  // setTimeout no admite más de 2^31-1 ms: si el vencimiento queda más lejos, se vuelve a comprobar después.
  const [expiryCheck, setExpiryCheck] = useState(0);
  useEffect(() => {
    if (expiresAt === null) return;
    const remaining = expiresAt.getTime() - Date.now();
    if (remaining <= 0) {
      setExpiresAt(null);
      return;
    }
    const timer = setTimeout(() => {
      if (Date.now() >= expiresAt.getTime()) setExpiresAt(null);
      else setExpiryCheck((n) => n + 1);
    }, Math.min(remaining, MAX_TIMEOUT_MS));
    return () => clearTimeout(timer);
  }, [expiresAt, expiryCheck]);

  const withAdminAuth = useCallback(async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (reason) {
      if (!isAdminAuthRequired(reason)) throw reason;
      await new Promise<void>((resolve, reject) => {
        waitersRef.current.push({ resolve, reject, original: reason });
        setError(null);
        setOpen(true);
      });
      // Una sola repetición: si vuelve a fallar, el error llega al llamador.
      return run();
    }
  }, []);

  const onSubmit = useCallback(
    (password: string) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setSubmitting(true);
      setError(null);
      void (async () => {
        try {
          const response = await apiClient.post<AdminAuthorizationResponse>('/admin-authorization', { password });
          const expires = new Date(response.expiresAt);
          if (!Number.isNaN(expires.getTime())) {
            setExpiresAt(expires);
            setNotice(MESSAGES.adminAuth.grantedUntil(formatTime(expires)));
          }
          settle({ ok: true });
        } catch (reason) {
          const apiError = toApiError(reason);
          if (apiError.status === 401) {
            if (await sessionIsActive()) {
              setError(apiError.message || MESSAGES.adminAuth.wrongPassword);
            } else {
              // La Sesión expiró: el cliente ya limpió al usuario y redirigió a /login.
              settle({ ok: false, error: apiError });
            }
          } else {
            setError(apiError.message);
          }
        } finally {
          submittingRef.current = false;
          setSubmitting(false);
        }
      })();
    },
    [settle],
  );

  const onCancel = useCallback(() => {
    if (submittingRef.current) return;
    settle({ ok: false });
  }, [settle]);

  const onNoticeClose = useCallback(() => setNotice(null), []);

  const revoke = useCallback(async () => {
    await apiClient.delete('/admin-authorization');
    setExpiresAt(null);
    setNotice(null);
  }, []);

  return {
    withAdminAuth,
    expiresAt,
    revoke,
    dialog: { open, submitting, error, onSubmit, onCancel, notice, onNoticeClose },
  };
}
