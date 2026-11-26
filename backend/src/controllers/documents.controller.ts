// Controlador de Documentos_de_Empleado y Apartado_Privado (Req. 19, 13.1–13.3).

import type { Request, RequestHandler, Response } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type { DocumentBody } from '../schemas/documents';
import type { DocumentsService } from '../services/documents.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;
const docIdOf = (req: Request): number => (req.params as unknown as { docId: number }).docId;

function sendPdf(res: Response, content: Uint8Array, filename: string): void {
  res.set({
    'Content-Type': 'application/pdf',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
  });
  res.status(200).end(Buffer.from(content));
}

export function createDocumentsController(service: DocumentsService) {
  const listOwn: RequestHandler = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ data: await service.listOwn(actorOf(req)) });
  };

  const downloadOwn: RequestHandler = async (req, res) => {
    const { content, filename } = await service.downloadOwn(actorOf(req), docIdOf(req));
    sendPdf(res, content, filename);
  };

  const listForEmployee: RequestHandler = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ data: await service.listForEmployee(actorOf(req), idOf(req)) });
  };

  const get: RequestHandler = async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ data: await service.get(actorOf(req), docIdOf(req)) });
  };

  const download: RequestHandler = async (req, res) => {
    const { content, filename } = await service.download(actorOf(req), docIdOf(req));
    sendPdf(res, content, filename);
  };

  const upload: RequestHandler = async (req, res) => {
    const file = req.file;
    const pdf = file ? { buffer: file.buffer, size: file.size, mimetype: file.mimetype } : undefined;
    res.status(201).json({ data: await service.upload(actorOf(req), idOf(req), req.body as DocumentBody, pdf) });
  };

  const replace: RequestHandler = async (req, res) => {
    const file = req.file;
    const pdf = file ? { buffer: file.buffer, size: file.size, mimetype: file.mimetype } : undefined;
    res.status(200).json({ data: await service.replace(actorOf(req), docIdOf(req), req.body as DocumentBody, pdf) });
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(actorOf(req), docIdOf(req));
    res.status(204).end();
  };

  return { listOwn, downloadOwn, listForEmployee, get, download, upload, replace, remove };
}
