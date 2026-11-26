// Controlador de Pacientes, movimientos y Tratamientos_Programados (Req. 6, 20, 21).

import type { Request, RequestHandler } from 'express';
import { UnauthenticatedError } from '../lib/errors';
import type {
  ObservationBody,
  PatientBody,
  PatientListQuery,
  PatientStatusBody,
  ReadmissionBody,
  TreatmentBody,
  TreatmentListQuery,
  TreatmentStatusBody,
} from '../schemas/patients';
import type { PatientsService } from '../services/patients.service';
import type { Actor } from '../services/staff.service';

function actorOf(req: Request): Actor {
  if (!req.auth) throw new UnauthenticatedError();
  return { id: req.auth.user.id, role: req.auth.user.role };
}

const idOf = (req: Request): number => (req.params as unknown as { id: number }).id;
const tidOf = (req: Request): number => (req.params as unknown as { tid: number }).tid;

export function createPatientsController(service: PatientsService) {
  const list: RequestHandler = async (req, res) => {
    res.status(200).json(await service.list(actorOf(req), req.query as unknown as PatientListQuery));
  };

  const counts: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.counts(actorOf(req)) });
  };

  const get: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.get(actorOf(req), idOf(req)) });
  };

  const create: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.create(actorOf(req), req.body as PatientBody) });
  };

  const update: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.update(idOf(req), req.body as PatientBody) });
  };

  const changeStatus: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.changeStatus(actorOf(req), idOf(req), req.body as PatientStatusBody) });
  };

  const readmit: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.readmit(actorOf(req), idOf(req), req.body as ReadmissionBody) });
  };

  const setMedicalObservation: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.setMedicalObservation(actorOf(req), idOf(req), req.body as ObservationBody) });
  };

  const setNursingObservation: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.setNursingObservation(actorOf(req), idOf(req), req.body as ObservationBody) });
  };

  const movements: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.movements(actorOf(req), idOf(req)) });
  };

  const listTreatments: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.listTreatments(actorOf(req), idOf(req), req.query as unknown as TreatmentListQuery) });
  };

  const createTreatment: RequestHandler = async (req, res) => {
    res.status(201).json({ data: await service.createTreatment(actorOf(req), idOf(req), req.body as TreatmentBody) });
  };

  const updateTreatment: RequestHandler = async (req, res) => {
    res.status(200).json({ data: await service.updateTreatment(actorOf(req), idOf(req), tidOf(req), req.body as TreatmentBody) });
  };

  const changeTreatmentStatus: RequestHandler = async (req, res) => {
    res.status(200).json({
      data: await service.changeTreatmentStatus(actorOf(req), idOf(req), tidOf(req), req.body as TreatmentStatusBody),
    });
  };

  const remove: RequestHandler = async (req, res) => {
    await service.remove(idOf(req));
    res.status(204).end();
  };

  return {
    list,
    counts,
    get,
    create,
    update,
    changeStatus,
    readmit,
    setMedicalObservation,
    setNursingObservation,
    movements,
    listTreatments,
    createTreatment,
    updateTreatment,
    changeTreatmentStatus,
    remove,
  };
}
