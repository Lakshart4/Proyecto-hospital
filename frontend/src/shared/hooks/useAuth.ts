import { createContext, useContext } from 'react';
import type { Role } from '../../app/permissions';

/** Usuario que devuelven `GET /auth/me` y `POST /auth/login`. */
export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  mustChangePassword: boolean;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  /** `POST /auth/login`; devuelve el usuario. Lanza `ApiError` si falla. */
  login: (email: string, password: string) => Promise<AuthUser>;
  /** `POST /auth/logout`, limpia el usuario y lleva a `/login`. */
  logout: () => Promise<void>;
  /** Vuelve a consultar `GET /auth/me`. */
  refresh: () => Promise<AuthUser | null>;
  /** Actualiza datos del usuario en memoria (por ejemplo, `mustChangePassword` tras cambiar la contraseña). */
  updateUser: (changes: Partial<Omit<AuthUser, 'id' | 'role'>>) => void;
  /** Olvida al usuario en memoria sin llamar a la API (la Sesión ya no es válida en el servidor). */
  clearUser: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) throw new Error('useAuth debe usarse dentro de AuthProvider.');
  return value;
}
