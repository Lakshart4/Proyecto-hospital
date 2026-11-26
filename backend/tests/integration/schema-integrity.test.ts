// Pruebas de integridad referencial del esquema (verificación de la tarea 2.1).
// Cada ejecución crea una base SQLite temporal, le aplica las migraciones con
// `prisma migrate deploy` y la elimina al terminar. No toca prisma/dev.db.

import type { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTempDatabase, type TempDatabase } from '../helpers/temp-database';

let db: TempDatabase | undefined;
let prisma: PrismaClient;
let seq = 0;

beforeAll(() => {
  db = createTempDatabase('hm-schema-');
  prisma = db.client;
}, 120_000);

afterAll(async () => {
  await db?.cleanup();
});

// ---------- Ayudantes para crear datos mínimos ----------

const next = () => ++seq;

async function department() {
  return prisma.department.create({ data: { name: `Departamento ${next()}` } });
}

async function user(departmentId: number, role = 'DOCTOR') {
  const n = next();
  return prisma.user.create({
    data: {
      internalId: `T-${n}`,
      email: `usuario${n}@example.com`,
      passwordHash: 'hash-ficticio',
      role,
      name: `Usuario ${n}`,
      position: 'Cargo',
      specialty: 'Especialidad',
      departmentId,
      yearsExperience: 1,
      shift: 'matutino',
      phone: '555-0000',
    },
  });
}

async function patient(departmentId: number, doctorId: number, nurseId: number) {
  const n = next();
  return prisma.patient.create({
    data: {
      internalId: `P-${n}`,
      firstName: 'Paciente',
      lastName: `${n}`,
      birthDate: new Date('1990-01-01T00:00:00Z'),
      sex: 'X',
      admissionDate: new Date('2026-01-01T00:00:00Z'),
      reason: 'Motivo',
      departmentId,
      doctorId,
      nurseId,
    },
  });
}

async function supplier() {
  return prisma.supplier.create({ data: { name: `Proveedor ${next()}`, contact: 'contacto@example.com' } });
}

async function product(supplierId: number, category = 'insumo médico') {
  return prisma.product.create({
    data: { name: `Producto ${next()}`, category, classification: 'jeringa', quantity: 10, minStock: 2, supplierId },
  });
}

async function expectPrismaError(operation: Promise<unknown>, code: string) {
  await expect(operation).rejects.toMatchObject({ code });
}

// ---------- Pruebas ----------

describe('Esquema: claves foráneas activas', () => {
  it('rechaza crear un registro que referencia una entidad inexistente (P2003)', async () => {
    await expectPrismaError(user(999_999), 'P2003');
  });
});

describe('Esquema: Restrict impide borrar entidades con dependientes (P2003)', () => {
  it('Departamento con Empleados', async () => {
    const d = await department();
    await user(d.id);
    await expectPrismaError(prisma.department.delete({ where: { id: d.id } }), 'P2003');
  });

  it('Proveedor con Productos', async () => {
    const s = await supplier();
    await product(s.id);
    await expectPrismaError(prisma.supplier.delete({ where: { id: s.id } }), 'P2003');
  });

  it('Habitación con Asignaciones', async () => {
    const d = await department();
    const doctor = await user(d.id, 'DOCTOR');
    const nurse = await user(d.id, 'NURSE');
    const p = await patient(d.id, doctor.id, nurse.id);
    const room = await prisma.room.create({ data: { number: next(), departmentId: d.id, capacity: 2 } });
    await prisma.roomAssignment.create({ data: { roomId: room.id, patientId: p.id, startedAt: new Date() } });
    await expectPrismaError(prisma.room.delete({ where: { id: room.id } }), 'P2003');
    await expectPrismaError(prisma.patient.delete({ where: { id: p.id } }), 'P2003');
  });

  it('Producto con Movimientos de inventario', async () => {
    const d = await department();
    const admin = await user(d.id, 'ADMIN');
    const pr = await product((await supplier()).id);
    await prisma.inventoryMovement.create({
      data: { productId: pr.id, type: 'ajuste', quantityBefore: 0, quantityAfter: 10, reason: 'Inicial', userId: admin.id },
    });
    await expectPrismaError(prisma.product.delete({ where: { id: pr.id } }), 'P2003');
  });

  it('Equipo con Registros de mantenimiento', async () => {
    const d = await department();
    const eq = await prisma.equipment.create({
      data: { name: 'Monitor', category: 'Monitoreo', departmentId: d.id, quantity: 1, location: 'Sala 1', operationalStatus: 'en mantenimiento' },
    });
    await prisma.maintenanceRecord.create({
      data: { equipmentId: eq.id, type: 'preventivo', startDate: new Date(), description: 'Revisión', technician: 'Técnico' },
    });
    await expectPrismaError(prisma.equipment.delete({ where: { id: eq.id } }), 'P2003');
  });

  it('Empleado responsable de un Paciente', async () => {
    const d = await department();
    const doctor = await user(d.id, 'DOCTOR');
    const nurse = await user(d.id, 'NURSE');
    await patient(d.id, doctor.id, nurse.id);
    await expectPrismaError(prisma.user.delete({ where: { id: doctor.id } }), 'P2003');
    await expectPrismaError(prisma.user.delete({ where: { id: nurse.id } }), 'P2003');
  });

  it('Administrador que creó un Evento general', async () => {
    const d = await department();
    const admin = await user(d.id, 'ADMIN');
    await prisma.event.create({
      data: { title: 'Reunión', type: 'general', startAt: new Date(), endAt: new Date(), createdById: admin.id },
    });
    await expectPrismaError(prisma.user.delete({ where: { id: admin.id } }), 'P2003');
  });
});

describe('Esquema: Cascade y SetNull', () => {
  it('borrar una Sesión elimina su Autorización_Administrativa', async () => {
    const d = await department();
    const admin = await user(d.id, 'ADMIN');
    const session = await prisma.session.create({ data: { tokenHash: `sess-${next()}`, userId: admin.id } });
    await prisma.adminAuthorization.create({
      data: { sessionId: session.id, userId: admin.id, tokenHash: `aid-${next()}`, expiresAt: new Date(Date.now() + 600_000) },
    });
    await prisma.session.delete({ where: { id: session.id } });
    expect(await prisma.adminAuthorization.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: admin.id } })).toBe(1);
  });

  it('borrar un Usuario sin dependientes con Restrict elimina sus datos propios y deja la auditoría sin usuario', async () => {
    const d = await department();
    const u = await user(d.id, 'CLEANING');
    const session = await prisma.session.create({ data: { tokenHash: `sess-${next()}`, userId: u.id } });
    await prisma.adminAuthorization.create({
      data: { sessionId: session.id, userId: u.id, tokenHash: `aid-${next()}`, expiresAt: new Date() },
    });
    await prisma.passwordResetToken.create({ data: { userId: u.id, tokenHash: `rst-${next()}`, expiresAt: new Date() } });
    const slot = await prisma.scheduleSlot.create({
      data: { userId: u.id, dayOfWeek: 1, startTime: '08:00', endTime: '16:00', mealStart: '12:00', mealEnd: '13:00' },
    });
    await prisma.scheduleBreak.create({ data: { slotId: slot.id, startTime: '10:00', endTime: '10:15' } });
    await prisma.employeeDocument.create({
      data: { userId: u.id, type: 'contratación', title: 'Contrato', issuedAt: new Date(), filePath: 'x.pdf', fileSize: 100 },
    });
    const log = await prisma.auditLog.create({ data: { userId: u.id, action: 'LOGIN_SUCCESS', entityType: 'User', entityId: u.id } });

    await prisma.user.delete({ where: { id: u.id } });

    expect(await prisma.session.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.adminAuthorization.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.passwordResetToken.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.scheduleSlot.count({ where: { userId: u.id } })).toBe(0);
    expect(await prisma.scheduleBreak.count({ where: { slotId: slot.id } })).toBe(0);
    expect(await prisma.employeeDocument.count({ where: { userId: u.id } })).toBe(0);
    const kept = await prisma.auditLog.findUnique({ where: { id: log.id } });
    expect(kept).not.toBeNull();
    expect(kept?.userId).toBeNull();
  });

  it('borrar el autor de una observación conserva el texto y deja el autor en nulo (SetNull)', async () => {
    const d = await department();
    const doctor = await user(d.id, 'DOCTOR');
    const nurse = await user(d.id, 'NURSE');
    const author = await user(d.id, 'ADMIN');
    const p = await patient(d.id, doctor.id, nurse.id);
    await prisma.patient.update({
      where: { id: p.id },
      data: {
        medicalObservation: 'Estable',
        medicalObservationAt: new Date(),
        medicalObservationById: author.id,
        nursingObservation: 'Sin novedades',
        nursingObservationAt: new Date(),
        nursingObservationById: author.id,
      },
    });
    await prisma.user.delete({ where: { id: author.id } });
    const after = await prisma.patient.findUniqueOrThrow({ where: { id: p.id } });
    expect(after.medicalObservation).toBe('Estable');
    expect(after.medicalObservationById).toBeNull();
    expect(after.nursingObservationById).toBeNull();
  });

  it('borrar un Paciente sin Asignaciones elimina sus movimientos y tratamientos', async () => {
    const d = await department();
    const doctor = await user(d.id, 'DOCTOR');
    const nurse = await user(d.id, 'NURSE');
    const p = await patient(d.id, doctor.id, nurse.id);
    await prisma.patientMovement.create({
      data: { patientId: p.id, type: 'ingreso', occurredAt: new Date(), departmentId: d.id, userId: doctor.id },
    });
    await prisma.treatment.create({
      data: { patientId: p.id, type: 'tratamiento', scheduledAt: new Date(), description: 'Control', createdById: doctor.id },
    });
    await prisma.patient.delete({ where: { id: p.id } });
    expect(await prisma.patientMovement.count({ where: { patientId: p.id } })).toBe(0);
    expect(await prisma.treatment.count({ where: { patientId: p.id } })).toBe(0);
  });

  it('borrar un Producto sin movimientos elimina sus datos de medicamento', async () => {
    const pr = await product((await supplier()).id, 'medicamento');
    await prisma.medicationInfo.create({
      data: { productId: pr.id, type: 'genérico', activeIngredient: 'Paracetamol', controlClass: 'venta libre', requiresPrescription: false },
    });
    await prisma.product.delete({ where: { id: pr.id } });
    expect(await prisma.medicationInfo.count({ where: { productId: pr.id } })).toBe(0);
  });

  it('Evento personal: borrar a su propietario, que también es su creador, elimina el evento (Cascade + NoAction)', async () => {
    const d = await department();
    const owner = await user(d.id, 'NURSE');
    const ev = await prisma.event.create({
      data: {
        title: 'Recordatorio',
        type: 'agenda individual',
        startAt: new Date(),
        endAt: new Date(),
        ownerId: owner.id,
        createdById: owner.id,
      },
    });
    await prisma.user.delete({ where: { id: owner.id } });
    expect(await prisma.event.count({ where: { id: ev.id } })).toBe(0);
    expect(await prisma.user.count({ where: { id: owner.id } })).toBe(0);
  });

  it('Evento con propietario distinto de su creador: no se puede borrar al Administrador creador (NoAction)', async () => {
    const d = await department();
    const admin = await user(d.id, 'ADMIN');
    const owner = await user(d.id, 'DOCTOR');
    const ev = await prisma.event.create({
      data: {
        title: 'Cita asignada',
        type: 'agenda individual',
        startAt: new Date(),
        endAt: new Date(),
        ownerId: owner.id,
        createdById: admin.id,
      },
    });
    await expectPrismaError(prisma.user.delete({ where: { id: admin.id } }), 'P2003');
    expect(await prisma.user.count({ where: { id: admin.id } })).toBe(1);
    expect(await prisma.event.count({ where: { id: ev.id } })).toBe(1);
  });
});

describe('Esquema: restricciones únicas (P2002)', () => {
  it('ID interno y correo de Usuario duplicados', async () => {
    const d = await department();
    const u = await user(d.id);
    const base = {
      passwordHash: 'h', role: 'DOCTOR', name: 'X', position: 'X', specialty: 'X',
      departmentId: d.id, yearsExperience: 0, shift: 'matutino', phone: '1',
    };
    await expectPrismaError(prisma.user.create({ data: { ...base, internalId: u.internalId, email: 'otro@example.com' } }), 'P2002');
    await expectPrismaError(prisma.user.create({ data: { ...base, internalId: 'OTRO-ID', email: u.email } }), 'P2002');
  });

  it('un solo Horario_de_Trabajo por usuario y día de la semana', async () => {
    const d = await department();
    const u = await user(d.id);
    const slot = { userId: u.id, dayOfWeek: 2, startTime: '08:00', endTime: '14:00' };
    await prisma.scheduleSlot.create({ data: slot });
    await expectPrismaError(prisma.scheduleSlot.create({ data: slot }), 'P2002');
  });

  it('un solo Movimiento_de_Inventario por Entrega_de_Proveedor', async () => {
    const d = await department();
    const admin = await user(d.id, 'ADMIN');
    const s = await supplier();
    const pr = await product(s.id);
    const delivery = await prisma.supplierDelivery.create({
      data: { supplierId: s.id, productId: pr.id, quantityRequested: 5, scheduledDate: new Date(), status: 'recibida' },
    });
    const movement = { productId: pr.id, type: 'entrada', quantityBefore: 10, quantityAfter: 15, reason: 'Entrega', userId: admin.id, deliveryId: delivery.id };
    await prisma.inventoryMovement.create({ data: movement });
    await expectPrismaError(prisma.inventoryMovement.create({ data: movement }), 'P2002');
  });

  it('fecha de Día_Inhábil, número de Habitación y nombre de Departamento únicos', async () => {
    const d = await department();
    const admin = await user(d.id, 'ADMIN');
    const date = new Date('2030-12-25T00:00:00Z');
    await prisma.nonWorkingDay.create({ data: { date, title: 'Cierre', createdById: admin.id } });
    await expectPrismaError(prisma.nonWorkingDay.create({ data: { date, title: 'Otro', createdById: admin.id } }), 'P2002');

    const number = 90_000 + next();
    await prisma.room.create({ data: { number, departmentId: d.id, capacity: 1 } });
    await expectPrismaError(prisma.room.create({ data: { number, departmentId: d.id, capacity: 1 } }), 'P2002');

    await expectPrismaError(prisma.department.create({ data: { name: d.name } }), 'P2002');
  });
});
