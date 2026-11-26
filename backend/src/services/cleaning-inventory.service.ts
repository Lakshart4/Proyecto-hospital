// Servicio independiente del Módulo_Inventario_Limpieza (Req. 23).
//
// Las reglas de stock y de persistencia se comparten con el inventario médico, pero esta
// fachada fija el área `cleaning`: ningún llamador puede cambiar el alcance por parámetro.

import type { Database } from '../repositories/database';
import { createInventoryService } from './inventory.service';
import type { Actor } from './staff.service';
import type {
  MovementBody,
  ProductBody,
  ProductListQuery,
  ProductMovementsQuery,
} from '../schemas/cleaning-inventory';

export interface CleaningInventoryServiceOptions {
  db: Database;
}

export function createCleaningInventoryService(options: CleaningInventoryServiceOptions) {
  const inventory = createInventoryService({ db: options.db, area: 'cleaning' });

  return {
    list: (actor: Actor, query: ProductListQuery) => inventory.list(actor, query),
    get: (id: number) => inventory.get(id),
    create: (actor: Actor, body: ProductBody) => inventory.create(actor, body),
    update: (actor: Actor, id: number, body: ProductBody) => inventory.update(actor, id, body),
    remove: (id: number) => inventory.remove(id),
    move: (actor: Actor, id: number, body: MovementBody) => inventory.move(actor, id, body),
    productMovements: (id: number, query: ProductMovementsQuery) => inventory.productMovements(id, query),
  };
}

export type CleaningInventoryService = ReturnType<typeof createCleaningInventoryService>;
