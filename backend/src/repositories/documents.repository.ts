// Acceso a datos de Documentos_de_Empleado (Req. 19).

import type { DocumentType } from '../domain/constants';
import type { EmployeeDocumentRow } from '../domain/files';
import type { Database } from './database';
import { runWithDbErrors } from './db-errors';
import type { DbClient } from './transaction';

type Client = Database | DbClient;

export interface EmployeeDocumentRecord extends EmployeeDocumentRow {
  filePath: string;
}

const DOC_SELECT = {
  id: true,
  userId: true,
  type: true,
  title: true,
  issuedAt: true,
  expiresAt: true,
  filePath: true,
  fileSize: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface NewDocumentData {
  userId: number;
  type: DocumentType;
  title: string;
  issuedAt: Date;
  expiresAt: Date | null;
  filePath: string;
  fileSize: number;
}

export interface UpdateDocumentData {
  type: DocumentType;
  title: string;
  issuedAt: Date;
  expiresAt: Date | null;
  filePath?: string;
  fileSize?: number;
}

export async function findEmployeeRole(db: Client, userId: number): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return user?.role ?? null;
}

export async function listDocumentsByUser(db: Client, userId: number): Promise<EmployeeDocumentRecord[]> {
  return db.employeeDocument.findMany({
    where: { userId },
    select: DOC_SELECT,
    orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function findDocumentById(db: Client, id: number): Promise<EmployeeDocumentRecord | null> {
  return db.employeeDocument.findUnique({ where: { id }, select: DOC_SELECT });
}

export async function createDocument(tx: DbClient, data: NewDocumentData): Promise<EmployeeDocumentRecord> {
  return runWithDbErrors({ operation: 'create', referenceField: 'userId' }, () =>
    tx.employeeDocument.create({ data, select: DOC_SELECT }),
  );
}

export async function updateDocument(tx: DbClient, id: number, data: UpdateDocumentData): Promise<EmployeeDocumentRecord> {
  return runWithDbErrors({ operation: 'update' }, () =>
    tx.employeeDocument.update({ where: { id }, data, select: DOC_SELECT }),
  );
}

export async function deleteDocument(tx: DbClient, id: number): Promise<void> {
  await runWithDbErrors({ operation: 'delete' }, () => tx.employeeDocument.delete({ where: { id } }));
}
