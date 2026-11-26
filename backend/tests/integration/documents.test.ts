// Pruebas de integración de Documentos_de_Empleado y Apartado_Privado (tarea 6.4; Req. 18.5, 19.1–19.8, 12.9).

import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_PDF_BYTES } from '../../src/domain/files';
import { createStaffHarness, writeDocumentFile, type StaffHarness, type UserKey } from '../helpers/staff-harness';

let h: StaffHarness;
const cookies: Partial<Record<UserKey, string>> = {};
const as = async (key: UserKey) => (cookies[key] ??= await h.sid(key));

const pdfBytes = (text = 'Documento ficticio de prueba', extraSize = 0) => {
  const head = Buffer.from(`%PDF-1.4\n${text}\n`);
  return extraSize > 0 ? Buffer.concat([head, Buffer.alloc(extraSize, 0x20)]) : head;
};

const auditRows = (where: Record<string, unknown> = {}) => h.client.auditLog.findMany({ where, orderBy: { id: 'asc' } });

async function getAdminCookies() {
  const sid = await as('admin');
  const authRes = await request(h.app)
    .post('/api/admin-authorization')
    .set('Cookie', sid)
    .send({ password: h.users.admin.password });
  expect(authRes.status).toBe(201);
  const aidHeader = (authRes.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('aid=')) as string;
  const aid = aidHeader.split(';')[0] as string;
  return `${sid}; ${aid}`;
}

beforeAll(async () => {
  h = await createStaffHarness();
}, 120_000);

afterAll(async () => {
  await h?.cleanup();
});

describe('Autorización administrativa y RBAC en documentos', () => {
  it('exige sesión (401), rol ADMIN (403) y Autorización_Administrativa vigente (403 AUTORIZACION_ADMIN_REQUERIDA)', async () => {
    expect((await request(h.app).get(`/api/staff/${h.users.doctor1.id}/documents`)).status).toBe(401);
    expect((await request(h.app).get(`/api/staff/${h.users.doctor1.id}/documents`).set('Cookie', await as('doctor1'))).status).toBe(403);
    expect((await request(h.app).get(`/api/staff/${h.users.doctor1.id}/documents`).set('Cookie', await as('pending'))).body.code).toBe(
      'PASSWORD_CHANGE_REQUIRED',
    );

    const noAuth = await request(h.app).get(`/api/staff/${h.users.doctor1.id}/documents`).set('Cookie', await as('admin'));
    expect(noAuth.status).toBe(403);
    expect(noAuth.body.code).toBe('AUTORIZACION_ADMIN_REQUERIDA');

    const noAuthPost = await request(h.app)
      .post(`/api/staff/${h.users.doctor1.id}/documents`)
      .set('Cookie', await as('admin'))
      .field('type', 'contratación')
      .field('title', 'Sin AA')
      .field('issuedAt', '2026-01-01')
      .attach('file', pdfBytes(), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(noAuthPost.status).toBe(403);
    expect(noAuthPost.body.code).toBe('AUTORIZACION_ADMIN_REQUERIDA');
  });
});

describe('Gestión administrativa de documentos (ADMIN + AA)', () => {
  it('carga, lista, consulta, descarga, reemplaza y elimina documentos PDF con auditoría', async () => {
    const adminAuth = await getAdminCookies();
    const content1 = pdfBytes('Contrato inicial');

    // Carga (POST)
    const uploadRes = await request(h.app)
      .post(`/api/staff/${h.users.doctor1.id}/documents`)
      .set('Cookie', adminAuth)
      .field('type', 'contratación')
      .field('title', 'Contrato Médico')
      .field('issuedAt', '2025-01-10')
      .field('expiresAt', '2025-06-01')
      .attach('file', content1, { filename: 'contrato.pdf', contentType: 'application/pdf' });
    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.data).toEqual(
      expect.objectContaining({
        userId: h.users.doctor1.id,
        type: 'contratación',
        title: 'Contrato Médico',
        issuedAt: '2025-01-10',
        expiresAt: '2025-06-01',
        expired: true,
        fileSize: content1.length,
      }),
    );
    const docId = uploadRes.body.data.id as number;
    const savedRow = await h.client.employeeDocument.findUnique({ where: { id: docId } });
    expect(savedRow).not.toBeNull();
    const file1Path = join(h.documentsDir, savedRow!.filePath);
    expect(existsSync(file1Path)).toBe(true);

    // Lista (GET /staff/:id/documents)
    const listRes = await request(h.app).get(`/api/staff/${h.users.doctor1.id}/documents`).set('Cookie', adminAuth);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);
    expect(listRes.body.data[0].id).toBe(docId);

    // Consulta metadatos (GET /documents/:docId)
    const getRes = await request(h.app).get(`/api/documents/${docId}`).set('Cookie', adminAuth);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.title).toBe('Contrato Médico');

    // Descarga PDF (GET /documents/:docId/file)
    const dlRes = await request(h.app).get(`/api/documents/${docId}/file`).set('Cookie', adminAuth);
    expect(dlRes.status).toBe(200);
    expect(dlRes.headers['content-type']).toMatch(/^application\/pdf/);
    expect(dlRes.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.compare(Buffer.from(dlRes.body), content1)).toBe(0);

    // Reemplazo solo de metadatos (PUT sin archivo)
    const putMeta = await request(h.app)
      .put(`/api/documents/${docId}`)
      .set('Cookie', adminAuth)
      .field('type', 'acreditación')
      .field('title', 'Acreditación Vigente')
      .field('issuedAt', '2026-01-15')
      .field('expiresAt', '2030-01-15');
    expect(putMeta.status).toBe(200);
    expect(putMeta.body.data).toEqual(
      expect.objectContaining({
        id: docId,
        type: 'acreditación',
        title: 'Acreditación Vigente',
        expired: false,
        fileSize: content1.length,
      }),
    );
    expect(existsSync(file1Path)).toBe(true);

    // Reemplazo con nuevo archivo (PUT con archivo): borra el anterior
    const content2 = pdfBytes('Nuevo PDF reemplazado');
    const putFile = await request(h.app)
      .put(`/api/documents/${docId}`)
      .set('Cookie', adminAuth)
      .field('type', 'acreditación')
      .field('title', 'Acreditación Renovada')
      .field('issuedAt', '2026-02-01')
      .attach('file', content2, { filename: 'nuevo.pdf', contentType: 'application/pdf' });
    expect(putFile.status).toBe(200);
    expect(putFile.body.data.expiresAt).toBeNull();
    expect(putFile.body.data.expired).toBe(false);
    expect(putFile.body.data.fileSize).toBe(content2.length);
    const updatedRow = await h.client.employeeDocument.findUnique({ where: { id: docId } });
    const file2Path = join(h.documentsDir, updatedRow!.filePath);
    expect(existsSync(file1Path)).toBe(false);
    expect(existsSync(file2Path)).toBe(true);

    // Eliminación (DELETE): borra fila y archivo
    const delRes = await request(h.app).delete(`/api/documents/${docId}`).set('Cookie', adminAuth);
    expect(delRes.status).toBe(204);
    expect(await h.client.employeeDocument.findUnique({ where: { id: docId } })).toBeNull();
    expect(existsSync(file2Path)).toBe(false);

    const actions = (await auditRows({ entityType: 'EmployeeDocument' })).map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining(['DOCUMENT_UPLOAD', 'DOCUMENT_READ', 'DOCUMENT_DOWNLOAD', 'DOCUMENT_REPLACE', 'DOCUMENT_DELETE']),
    );
  });

  it('rechaza PDF falso, >5 MB o fechas inválidas con 400 conservando los datos previos', async () => {
    const adminAuth = await getAdminCookies();
    const filesBefore = readdirSync(h.documentsDir);

    const fakePdf = await request(h.app)
      .post(`/api/staff/${h.users.doctor1.id}/documents`)
      .set('Cookie', adminAuth)
      .field('type', 'contratación')
      .field('title', 'Falso')
      .field('issuedAt', '2026-01-01')
      .attach('file', Buffer.from('NO ES PDF'), { filename: 'falso.pdf', contentType: 'application/pdf' });
    expect(fakePdf.status).toBe(400);
    expect(fakePdf.body.errors.map((e: { field: string }) => e.field)).toContain('file');

    const tooBig = await request(h.app)
      .post(`/api/staff/${h.users.doctor1.id}/documents`)
      .set('Cookie', adminAuth)
      .field('type', 'contratación')
      .field('title', 'Grande')
      .field('issuedAt', '2026-01-01')
      .attach('file', pdfBytes('x', MAX_PDF_BYTES + 1), { filename: 'grande.pdf', contentType: 'application/pdf' });
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.errors.map((e: { field: string }) => e.field)).toContain('file');

    const badDates = await request(h.app)
      .post(`/api/staff/${h.users.doctor1.id}/documents`)
      .set('Cookie', adminAuth)
      .field('type', 'contratación')
      .field('title', 'Fechas malas')
      .field('issuedAt', '2099-01-01')
      .field('expiresAt', '2025-01-01')
      .attach('file', pdfBytes(), { filename: 'ok.pdf', contentType: 'application/pdf' });
    expect(badDates.status).toBe(400);
    expect(badDates.body.errors.map((e: { field: string }) => e.field)).toEqual(expect.arrayContaining(['issuedAt', 'expiresAt']));

    expect(readdirSync(h.documentsDir)).toEqual(filesBefore);
  });

  it('si la auditoría falla al consultar, descargar, cargar o eliminar, responde 500 sin entregar datos ni alterar archivos', async () => {
    const adminAuth = await getAdminCookies();
    const content = pdfBytes('Contenido protegido');
    const created = await request(h.app)
      .post(`/api/staff/${h.users.nurse.id}/documents`)
      .set('Cookie', adminAuth)
      .field('type', 'contratación')
      .field('title', 'Doc Protegido')
      .field('issuedAt', '2026-01-01')
      .attach('file', content, { filename: 'protegido.pdf', contentType: 'application/pdf' });
    const docId = created.body.data.id as number;
    const filesBefore = readdirSync(h.documentsDir);

    await h.breakAudit();
    try {
      const readRes = await request(h.app).get(`/api/documents/${docId}`).set('Cookie', adminAuth);
      expect(readRes.status).toBe(500);
      expect(JSON.stringify(readRes.body)).not.toContain('Doc Protegido');

      const dlRes = await request(h.app).get(`/api/documents/${docId}/file`).set('Cookie', adminAuth);
      expect(dlRes.status).toBe(500);
      expect(dlRes.text).not.toContain('Contenido protegido');

      const uploadFail = await request(h.app)
        .post(`/api/staff/${h.users.nurse.id}/documents`)
        .set('Cookie', adminAuth)
        .field('type', 'contratación')
        .field('title', 'No debe quedar')
        .field('issuedAt', '2026-01-01')
        .attach('file', pdfBytes('Basura'), { filename: 'no.pdf', contentType: 'application/pdf' });
      expect(uploadFail.status).toBe(500);

      const delFail = await request(h.app).delete(`/api/documents/${docId}`).set('Cookie', adminAuth);
      expect(delFail.status).toBe(500);
    } finally {
      await h.restoreAudit();
    }

    expect(await h.client.employeeDocument.findUnique({ where: { id: docId } })).not.toBeNull();
    expect(readdirSync(h.documentsDir)).toEqual(filesBefore);
  });
});

describe('Apartado_Privado (/api/me/documents)', () => {
  it('un Empleado solo consulta y descarga sus propios documentos y recibe 403 ante documentos ajenos', async () => {
    const adminAuth = await getAdminCookies();
    const docContent = pdfBytes('PDF privado de limpieza');
    const created = await request(h.app)
      .post(`/api/staff/${h.users.cleaner.id}/documents`)
      .set('Cookie', adminAuth)
      .field('type', 'acreditación')
      .field('title', 'Certificado Limpieza')
      .field('issuedAt', '2026-01-01')
      .field('expiresAt', '2026-02-01')
      .attach('file', docContent, { filename: 'cert.pdf', contentType: 'application/pdf' });
    expect(created.status).toBe(201);
    const cleanerDocId = created.body.data.id as number;

    const listOwn = await request(h.app).get('/api/me/documents').set('Cookie', await as('cleaner'));
    expect(listOwn.status).toBe(200);
    expect(listOwn.body.data).toHaveLength(1);
    expect(listOwn.body.data[0]).toEqual(expect.objectContaining({ id: cleanerDocId, title: 'Certificado Limpieza', expired: true }));

    const dlOwn = await request(h.app).get(`/api/me/documents/${cleanerDocId}/file`).set('Cookie', await as('cleaner'));
    expect(dlOwn.status).toBe(200);
    expect(dlOwn.headers['content-type']).toMatch(/^application\/pdf/);
    expect(Buffer.compare(Buffer.from(dlOwn.body), docContent)).toBe(0);

    // Otro Empleado recibe 403 sin datos.
    const otherDl = await request(h.app).get(`/api/me/documents/${cleanerDocId}/file`).set('Cookie', await as('doctor1'));
    expect(otherDl.status).toBe(403);
    expect(otherDl.text).not.toContain('PDF privado de limpieza');

    // Tampoco puede cargar o modificar en rutas de documentos.
    const tryUpload = await request(h.app)
      .post(`/api/staff/${h.users.cleaner.id}/documents`)
      .set('Cookie', await as('cleaner'))
      .field('type', 'contratación')
      .field('title', 'X')
      .field('issuedAt', '2026-01-01')
      .attach('file', pdfBytes(), { filename: 'x.pdf', contentType: 'application/pdf' });
    expect(tryUpload.status).toBe(403);

    // Fallo de auditoría en descarga propia responde 500 sin entregar el PDF.
    await h.breakAudit();
    try {
      const failOwn = await request(h.app).get(`/api/me/documents/${cleanerDocId}/file`).set('Cookie', await as('cleaner'));
      expect(failOwn.status).toBe(500);
      expect(failOwn.text).not.toContain('PDF privado de limpieza');
    } finally {
      await h.restoreAudit();
    }
  });

  it('los documentos no son accesibles como estáticos y los métodos no permitidos dan 405', async () => {
    const file = writeDocumentFile(h.documentsDir, 'seed/no-publico.pdf');
    writeFileSync(file, '%PDF-1.4 secreto');
    expect((await request(h.app).get('/storage/documents/seed/no-publico.pdf')).status).toBe(404);
    expect((await request(h.app).get('/api/storage/documents/seed/no-publico.pdf')).status).toBe(404);

    const m1 = await request(h.app).post('/api/me/documents').set('Cookie', await as('doctor1'));
    expect(m1.status).toBe(405);
    expect(m1.headers.allow).toBe('GET, HEAD');

    const m2 = await request(h.app).delete('/api/me/documents/1/file').set('Cookie', await as('doctor1'));
    expect(m2.status).toBe(405);
    expect(m2.headers.allow).toBe('GET, HEAD');
  });
});
