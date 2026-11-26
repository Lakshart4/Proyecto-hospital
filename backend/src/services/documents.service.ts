// Servicio de Documentos_de_Empleado y Apartado_Privado (Req. 18.5, 19.1–19.8, 12.2, 12.9).
//
// Toda consulta, descarga, carga, reemplazo o eliminación escribe su registro de Bitácora_de_Auditoría
// en una transacción antes de devolver datos o entregar el archivo; si la auditoría falla, la operación
// se revierte y responde 500 sin entregar datos ni archivos. Los cambios en disco se confirman o limpian
// respetando la integridad de la base de datos.

import {
  toEmployeeDocumentDto,
  validateDocumentDates,
  validateUpload,
} from '../domain/files';
import type { DocumentFiles } from '../lib/document-files';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  type FieldError,
} from '../lib/errors';
import { SIGNATURE_BYTES } from '../lib/file-signature';
import { writeAudit } from '../repositories/audit.repository';
import type { Database } from '../repositories/database';
import {
  createDocument,
  deleteDocument,
  findDocumentById,
  findEmployeeRole,
  listDocumentsByUser,
  updateDocument,
  type EmployeeDocumentRecord,
} from '../repositories/documents.repository';
import { withTransaction, type DbClient } from '../repositories/transaction';
import type { DocumentBody } from '../schemas/documents';
import { STAFF_MESSAGES, type Actor } from './staff.service';

export const DOCUMENT_MESSAGES = {
  notFound: 'El documento no existe.',
  employeeNotFound: 'El Empleado no existe.',
  noFile: 'Debes adjuntar un documento PDF en el campo "file".',
  invalidDocument: 'El documento no es válido.',
  fileMissing: 'El archivo del documento no se encuentra disponible.',
} as const;

export interface UploadedPdf {
  buffer: Uint8Array;
  size: number;
  mimetype: string;
}

export interface DocumentsServiceOptions {
  db: Database;
  documents: DocumentFiles;
  now?: () => Date;
}

type DocumentAuditAction =
  | 'DOCUMENT_READ'
  | 'DOCUMENT_DOWNLOAD'
  | 'DOCUMENT_UPLOAD'
  | 'DOCUMENT_REPLACE'
  | 'DOCUMENT_DELETE';

export function createDocumentsService(options: DocumentsServiceOptions) {
  const { db, documents } = options;
  const now = options.now ?? (() => new Date());

  const audit = (
    tx: DbClient,
    actor: Actor,
    action: DocumentAuditAction,
    entityId: number | null,
    details: Record<string, unknown>,
  ) => writeAudit(tx, { userId: actor.id, action, entityType: 'EmployeeDocument', entityId, details });

  const requireEmployeeForRead = async (employeeId: number) => {
    const role = await findEmployeeRole(db, employeeId);
    if (role === null || role === 'ADMIN') throw new NotFoundError(DOCUMENT_MESSAGES.employeeNotFound);
  };

  const requireEmployeeForWrite = async (employeeId: number) => {
    const role = await findEmployeeRole(db, employeeId);
    if (role === null) throw new NotFoundError(DOCUMENT_MESSAGES.employeeNotFound);
    if (role === 'ADMIN') throw new ConflictError(STAFF_MESSAGES.adminAccount);
  };

  const requireDoc = async (docId: number): Promise<EmployeeDocumentRecord> => {
    const doc = await findDocumentById(db, docId);
    if (doc === null) throw new NotFoundError(DOCUMENT_MESSAGES.notFound);
    return doc;
  };

  const readPdfContent = async (doc: EmployeeDocumentRecord): Promise<Uint8Array> => {
    const content = await documents.read(doc.filePath);
    if (content === null) throw new NotFoundError(DOCUMENT_MESSAGES.fileMissing);
    return content;
  };

  return {
    /** Apartado_Privado: lista los documentos del Empleado autenticado (Req. 19.4, 19.7, 19.9). */
    async listOwn(actor: Actor) {
      const today = now();
      const rows = await withTransaction(
        async (tx) => {
          await audit(tx, actor, 'DOCUMENT_READ', null, { ownerId: actor.id, scope: 'own' });
          return listDocumentsByUser(tx, actor.id);
        },
        { client: db },
      );
      return rows.map((row) => toEmployeeDocumentDto(row, today));
    },

    /** Descarga un documento propio; si pertenece a otro Empleado responde 403 sin datos (Req. 19.4, 19.5, 12.9). */
    async downloadOwn(actor: Actor, docId: number) {
      const doc = await requireDoc(docId);
      if (doc.userId !== actor.id) throw new ForbiddenError();
      await withTransaction(
        (tx) => audit(tx, actor, 'DOCUMENT_DOWNLOAD', doc.id, { ownerId: doc.userId, scope: 'own' }),
        { client: db },
      );
      const content = await readPdfContent(doc);
      return { content, filename: `documento-${doc.id}.pdf` };
    },

    /** ADMIN+AA: lista los documentos de un Empleado (Req. 19.2, 19.7, 12.9). */
    async listForEmployee(actor: Actor, employeeId: number) {
      await requireEmployeeForRead(employeeId);
      const today = now();
      const rows = await withTransaction(
        async (tx) => {
          await audit(tx, actor, 'DOCUMENT_READ', null, { ownerId: employeeId, scope: 'admin' });
          return listDocumentsByUser(tx, employeeId);
        },
        { client: db },
      );
      return rows.map((row) => toEmployeeDocumentDto(row, today));
    },

    /** ADMIN+AA: consulta los metadatos de un documento (Req. 19.2, 19.7, 12.9). */
    async get(actor: Actor, docId: number) {
      const doc = await requireDoc(docId);
      const today = now();
      await withTransaction(
        (tx) => audit(tx, actor, 'DOCUMENT_READ', doc.id, { ownerId: doc.userId, scope: 'admin' }),
        { client: db },
      );
      return toEmployeeDocumentDto(doc, today);
    },

    /** ADMIN+AA: descarga el PDF de un documento; si falla la auditoría no entrega datos (Req. 19.2, 12.9). */
    async download(actor: Actor, docId: number) {
      const doc = await requireDoc(docId);
      await withTransaction(
        (tx) => audit(tx, actor, 'DOCUMENT_DOWNLOAD', doc.id, { ownerId: doc.userId, scope: 'admin' }),
        { client: db },
      );
      const content = await readPdfContent(doc);
      return { content, filename: `documento-${doc.id}.pdf` };
    },

    /** ADMIN+AA: carga un nuevo Documento_de_Empleado PDF <= 5 MB (Req. 19.1–19.3, 19.7). */
    async upload(actor: Actor, employeeId: number, body: DocumentBody, file: UploadedPdf | undefined) {
      await requireEmployeeForWrite(employeeId);
      const today = now();
      const errors: FieldError[] = [...validateDocumentDates(body.issuedAt, body.expiresAt, today)];
      if (file === undefined) {
        errors.push({ field: 'file', message: DOCUMENT_MESSAGES.noFile });
      } else {
        const head = file.buffer.subarray(0, SIGNATURE_BYTES);
        errors.push(...validateUpload('pdf', { size: file.size, declaredType: file.mimetype, head }));
      }
      if (errors.length > 0 || file === undefined) {
        throw new ValidationError(DOCUMENT_MESSAGES.invalidDocument, errors);
      }

      const filePath = await documents.save(file.buffer);
      try {
        const created = await withTransaction(
          async (tx) => {
            const row = await createDocument(tx, {
              userId: employeeId,
              type: body.type,
              title: body.title,
              issuedAt: body.issuedAt,
              expiresAt: body.expiresAt,
              filePath,
              fileSize: file.size,
            });
            await audit(tx, actor, 'DOCUMENT_UPLOAD', row.id, { ownerId: employeeId, type: body.type });
            return row;
          },
          { client: db },
        );
        return toEmployeeDocumentDto(created, today);
      } catch (error) {
        await documents.remove(filePath);
        throw error;
      }
    },

    /** ADMIN+AA: reemplaza metadatos y/o archivo PDF de un documento (Req. 19.2, 19.3, 19.7). */
    async replace(actor: Actor, docId: number, body: DocumentBody, file: UploadedPdf | undefined) {
      const existing = await requireDoc(docId);
      const today = now();
      const errors: FieldError[] = [...validateDocumentDates(body.issuedAt, body.expiresAt, today)];
      if (file !== undefined) {
        const head = file.buffer.subarray(0, SIGNATURE_BYTES);
        errors.push(...validateUpload('pdf', { size: file.size, declaredType: file.mimetype, head }));
      }
      if (errors.length > 0) {
        throw new ValidationError(DOCUMENT_MESSAGES.invalidDocument, errors);
      }

      const newFilePath = file !== undefined ? await documents.save(file.buffer) : undefined;
      try {
        const updated = await withTransaction(
          async (tx) => {
            const row = await updateDocument(tx, docId, {
              type: body.type,
              title: body.title,
              issuedAt: body.issuedAt,
              expiresAt: body.expiresAt,
              ...(newFilePath !== undefined && file !== undefined ? { filePath: newFilePath, fileSize: file.size } : {}),
            });
            await audit(tx, actor, 'DOCUMENT_REPLACE', docId, {
              ownerId: existing.userId,
              type: body.type,
              fileReplaced: newFilePath !== undefined,
            });
            return row;
          },
          { client: db },
        );
        if (newFilePath !== undefined && existing.filePath !== newFilePath) {
          await documents.remove(existing.filePath);
        }
        return toEmployeeDocumentDto(updated, today);
      } catch (error) {
        if (newFilePath !== undefined) await documents.remove(newFilePath);
        throw error;
      }
    },

    /** ADMIN+AA: elimina la fila y el archivo asociado (Req. 19.2, 19.7). */
    async remove(actor: Actor, docId: number) {
      const existing = await requireDoc(docId);
      await withTransaction(
        async (tx) => {
          await audit(tx, actor, 'DOCUMENT_DELETE', docId, { ownerId: existing.userId, type: existing.type });
          await deleteDocument(tx, docId);
        },
        { client: db },
      );
      await documents.remove(existing.filePath);
    },
  };
}

export type DocumentsService = ReturnType<typeof createDocumentsService>;
