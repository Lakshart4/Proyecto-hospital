// Reglas puras varias del dominio (ver "Interfaces internas" del diseño).
// Contiene la paginación de listas (Req. 13.6, 13.7) y el saneador de detalles de auditoría (Req. 12.6);
// las demás funciones que el diseño ubica aquí se agregan en sus propias tareas.

import { ValidationError, type FieldError } from '../lib/errors';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 10;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 100;

export const PAGE_SIZE_MESSAGE = `El tamaño de página debe ser un número entero entre ${MIN_PAGE_SIZE} y ${MAX_PAGE_SIZE}.`;
export const PAGE_MESSAGE = 'La página debe ser un número entero mayor o igual a 1.';
export const PAGINATION_MESSAGE = 'Los parámetros de paginación no son válidos.';

/** Entero decimal escrito con dígitos y signo opcional; sin espacios, decimales, exponentes ni hexadecimal. */
const INTEGER_TEXT = /^-?\d+$/;

/**
 * Interpreta un valor recibido en la query string o en la ruta como entero.
 * Acepta un texto con solo dígitos (y signo `-` opcional) o un número entero, siempre dentro
 * del rango seguro de JavaScript. Devuelve `null` en cualquier otro caso
 * (por ejemplo `"abc"`, `"1.5"`, `"1e2"`, `" 5"`, `""` o un arreglo).
 */
export function parseIntegerString(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string' || !INTEGER_TEXT.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export interface Pagination {
  page: number;
  pageSize: number;
  /** Elementos que se omiten (para Prisma `skip`). */
  skip: number;
  /** Elementos que se devuelven (para Prisma `take`). */
  take: number;
}

export interface Page<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Un parámetro ausente, vacío o con solo espacios se considera "no indicado". */
const isNotGiven = (value: unknown) => value === undefined || (typeof value === 'string' && value.trim() === '');

/**
 * Lee `page` y `pageSize` de la query string (Req. 13.6, 13.7).
 * - Sin `pageSize` se usa 10; sin `page` se usa 1.
 * - `pageSize` debe ser un entero de 1 a 100; `page`, un entero mayor o igual a 1.
 * @throws ValidationError (400) con un error por cada parámetro inválido.
 */
export function parsePagination(query: Readonly<Record<string, unknown>>): Pagination {
  const errors: FieldError[] = [];

  let pageSize = DEFAULT_PAGE_SIZE;
  if (!isNotGiven(query.pageSize)) {
    const parsed = parseIntegerString(query.pageSize);
    if (parsed === null || parsed < MIN_PAGE_SIZE || parsed > MAX_PAGE_SIZE) {
      errors.push({ field: 'pageSize', message: PAGE_SIZE_MESSAGE });
    } else {
      pageSize = parsed;
    }
  }

  let page = DEFAULT_PAGE;
  if (!isNotGiven(query.page)) {
    const parsed = parseIntegerString(query.page);
    // El desplazamiento también debe ser un entero seguro.
    if (parsed === null || parsed < 1 || !Number.isSafeInteger((parsed - 1) * MAX_PAGE_SIZE)) {
      errors.push({ field: 'page', message: PAGE_MESSAGE });
    } else {
      page = parsed;
    }
  }

  if (errors.length > 0) throw new ValidationError(PAGINATION_MESSAGE, errors);

  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Arma la respuesta paginada `{ data, page, pageSize, total }` del diseño. */
export function toPage<T>(data: T[], total: number, pagination: Pick<Pagination, 'page' | 'pageSize'>): Page<T> {
  return { data, page: pagination.page, pageSize: pagination.pageSize, total };
}

// ---------- Detalles de auditoría (Req. 12.6, 17.9, 18.2) ----------

/**
 * Palabras que identifican una clave secreta cuando aparecen como segmento independiente del nombre:
 * `newPassword`, `password_hash`, `refreshToken`, `Contraseña`, `adminAuthorization`, `SESSION_SECRET`…
 * Un nombre que solo contiene el fragmento dentro de otra palabra (`hashtag`) no es secreto.
 */
const SECRET_KEY_WORDS = ['password', 'passwd', 'contrasena', 'hash', 'token', 'secret', 'authorization', 'autorizacion'];
/** Nombres exactos (sin distinguir mayúsculas) de las cookies de sesión (`sid`) y de autorización (`aid`). */
const SECRET_KEY_NAMES = ['sid', 'aid'];

/**
 * Segmentos de un nombre de clave, en minúsculas y sin acentos: separa camelCase, snake_case, kebab-case,
 * espacios, signos y los límites entre letras y números (`resetToken2Hash` → reset, token, 2, hash).
 */
export function auditKeySegments(key: string): string[] {
  return key
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([A-Za-z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([A-Za-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((segment) => segment !== '')
    .map((segment) => segment.toLowerCase());
}

/** Verdadero si la clave corresponde a una contraseña, hash, token, secreto o autorización. */
export function isSecretAuditKey(key: string): boolean {
  if (SECRET_KEY_NAMES.includes(key.toLowerCase())) return true;
  return auditKeySegments(key).some((segment) => SECRET_KEY_WORDS.includes(segment));
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sanitizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!isPlainObject(value)) return value;
  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    if (!isSecretAuditKey(key)) result[key] = sanitizeValue(nested);
  }
  return result;
}

/**
 * Property 39: copia de los detalles sin claves de contraseña, hash, Token_de_Recuperación,
 * Autorización_Administrativa ni token de sesión, a cualquier profundidad (también dentro de arreglos).
 * Conserva el resto de claves y valores. No modifica el objeto recibido.
 */
export function sanitizeAuditDetails(details: Readonly<Record<string, unknown>>): Record<string, unknown> {
  return sanitizeValue(details) as Record<string, unknown>;
}