// Consulta de la Bitácora_de_Auditoría (Req. 12.3, 12.4, 12.5, 13.6).

import { applyFilters, dateRange, equals } from '../domain/filters';
import { parsePagination, sanitizeAuditDetails, toPage } from '../domain/others';
import { listAuditLogs } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import type { AuditListQuery } from '../schemas/audit';

export interface AuditServiceOptions {
  db: Database;
}

function publicDetails(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return sanitizeAuditDetails(parsed as Record<string, unknown>);
  } catch {
    return {};
  }
}

export function createAuditService(options: AuditServiceOptions) {
  const { db } = options;

  return {
    async list(query: AuditListQuery) {
      const pagination = parsePagination(query as Record<string, unknown>);
      const rows = await listAuditLogs(db);
      const filtered = applyFilters(rows, [
        equals((row) => row.userId, query.userId),
        equals((row) => row.action, query.action),
        dateRange((row) => row.createdAt, { from: query.from, to: query.to }),
      ]);
      const page = filtered.slice(pagination.skip, pagination.skip + pagination.take);
      return toPage(page.map((row) => ({ ...row, details: publicDetails(row.details) })), filtered.length, pagination);
    },
  };
}

export type AuditService = ReturnType<typeof createAuditService>;
