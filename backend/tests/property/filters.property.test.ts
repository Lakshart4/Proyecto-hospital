// Prueba de propiedades de los filtros (tarea 3.7, Property 6).
//
// Parte generada: colecciones de tres tipos (registros genéricos, Productos y Movimientos_de_Inventario)
// con conjuntos aleatorios de filtros opcionales. El resultado de applyFilters se compara con un oráculo
// escrito a partir de la definición de cada filtro, con operaciones distintas de las de la implementación
// (mayúsculas con toUpperCase y días como texto ISO AAAA-MM-DD).
//
// Parte determinista: cuatro casos fijos con el resultado esperado escrito a mano, que garantizan en
// cada ejecución la detección de errores concretos (OR en lugar de AND, fin de rango exclusivo, búsqueda
// que distingue mayúsculas y filtro de Medicamento_Controlado que deja pasar insumos). Son pruebas
// aparte porque la opción `examples` de fast-check 4.10.3 cuenta dentro de `numRuns` y reduciría los
// casos generados por debajo de 100.
//
// Cobertura de requisitos (los filtros de cada lista se arman con los mismos criterios equals, search y
// dateRange que se prueban aquí):
// - 5.3 Empleados: rol, Departamento, Turno y búsqueda por nombre o ID interno (registros genéricos).
// - 6.5 Pacientes: estado, Departamento y búsqueda por nombre o ID interno (registros genéricos).
// - 7.9 y 22.6 Productos: categoría, subcategoría, disponibilidad, Stock_Bajo, Proveedor, tipo de
//   medicamento, clasificación de control, receta requerida y Medicamento_Controlado (productCriteria).
// - 8.6 Equipos: Departamento, categoría y Estado_Operativo (igualdad sobre campos de texto y número).
// - 9.10 Habitaciones: Departamento y disponibilidad (igualdad).
// - 12.4 Auditoría: usuario, acción y rango de fechas inclusivo (registros genéricos).
// - 24.7 Entregas: Proveedor, Producto, estado y rango de fechas inclusivo (igualdad y rango).
// - 25.5 Movimientos: Producto, categoría, tipo, usuario y rango de fechas inclusivo (movementCriteria).
// - 26.6 Mantenimiento: equipo, Departamento, tipo, en curso o cerrado y rango de fechas (registros genéricos).
// - 27.4 Historial de ocupación: Departamento, Motivo_de_Liberación y rango de fechas (registros genéricos).

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AUDIT_ACTIONS,
  CONTROL_CLASSES,
  INVENTORY_MOVEMENT_TYPES,
  MEDICATION_TYPES,
  PATIENT_STATUSES,
  PRODUCT_AVAILABILITY,
  PRODUCT_CATEGORIES,
  RELEASE_REASONS,
  ROLES,
  SHIFTS,
  SUPPLY_SUBCATEGORIES,
} from '../../src/domain/constants';
import {
  applyFilters,
  dateRange,
  equals,
  movementCriteria,
  productCriteria,
  search,
  type Criterion,
  type MovementFilters,
  type MovementLike,
  type ProductFilters,
  type ProductLike,
} from '../../src/domain/filters';

const RUNS = { numRuns: 100 };

// ---------- Oráculo: definiciones de cada filtro ----------

/** Filtro de texto indicado: no vacío después de recortar (decisión aprobada en la tarea 3.5). */
const givenTerm = (term: string | undefined): string | null =>
  term === undefined || term.trim() === '' ? null : term.trim().toUpperCase();

const containsIgnoringCase = (field: string, upperTerm: string) => field.toUpperCase().includes(upperTerm);

/** Día natural UTC como texto AAAA-MM-DD (comparable lexicográficamente). */
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function inInclusiveRange(date: Date | null, from: Date | undefined, to: Date | undefined): boolean {
  if (from === undefined && to === undefined) return true;
  if (date === null) return false;
  if (from !== undefined && isoDay(date) < isoDay(from)) return false;
  if (to !== undefined && isoDay(date) > isoDay(to)) return false;
  return true;
}

/** Igualdad de un filtro opcional: sin valor indicado, todos cumplen. */
const eq = <V>(filter: V | undefined, value: V | null | undefined) => filter === undefined || value === filter;

// ---------- Generadores comunes ----------

/** Letras con y sin acento, ñ y ü en ambos casos, para probar la búsqueda sin distinguir mayúsculas. */
const LETTERS = ['a', 'A', 'á', 'Á', 'e', 'É', 'i', 'Í', 'n', 'N', 'ñ', 'Ñ', 'o', 'Ó', 'u', 'Ü', ' ', '-'];
const textArb = (maxLength: number) => fc.array(fc.constantFrom(...LETTERS), { maxLength }).map((chars) => chars.join(''));

/** Fechas en 10 días de enero de 2026 (a cualquier hora), para que los rangos tengan coincidencias. */
const DAY_MS = 86_400_000;
const START = Date.UTC(2026, 0, 1);
const dateArb = fc.integer({ min: 0, max: 10 * DAY_MS - 1 }).map((offset) => new Date(START + offset));

/**
 * Filtro opcional: sin indicar (3 de 6), con un valor aleatorio del dominio (1 de 6) o con el valor de
 * un elemento "pivote" de la colección (2 de 6), para que la mayoría de las combinaciones de varios
 * filtros tengan coincidencias, sin dejar de generar combinaciones que no tienen ninguna.
 */
function opt<T>(arb: fc.Arbitrary<T>, pivotValue?: T | null): fc.Arbitrary<T | undefined> {
  const choices: fc.WeightedArbitrary<T | undefined>[] = [
    { arbitrary: fc.constant(undefined), weight: 3 },
    { arbitrary: arb, weight: 1 },
  ];
  if (pivotValue !== undefined && pivotValue !== null) choices.push({ arbitrary: fc.constant(pivotValue), weight: 2 });
  return fc.oneof(...choices);
}

/** Elemento pivote de la colección (o ninguno). */
const pivotArb = <T>(rows: T[]): fc.Arbitrary<T | undefined> =>
  rows.length === 0 ? fc.constant(undefined) : fc.option(fc.constantFrom(...rows), { nil: undefined, freq: 5 });

const LETTER = /\p{L}/u;
const flipCase = (c: string) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase());

/**
 * Fragmentos de un texto que contienen al menos una letra (nunca solo espacios o guiones), con
 * mayúsculas y minúsculas cambiadas al azar carácter por carácter. `null` si el texto no tiene letras.
 */
function fragmentArb(text: string): fc.Arbitrary<string> | null {
  const chars = [...text];
  const letterPositions = chars.flatMap((c, index) => (LETTER.test(c) ? [index] : []));
  if (letterPositions.length === 0) return null;
  return fc
    .tuple(
      fc.constantFrom(...letterPositions),
      fc.nat({ max: 3 }),
      fc.nat({ max: 3 }),
      fc.array(fc.boolean(), { minLength: 8, maxLength: 8 }),
    )
    .map(([position, before, after, flips]) =>
      chars
        .slice(Math.max(0, position - before), Math.min(chars.length, position + 1 + after))
        .map((c, k) => (flips[k] ? flipCase(c) : c))
        .join(''),
    );
}

function fragmentsOf(texts: string[]): fc.Arbitrary<string> | null {
  const arbitraries = texts.map(fragmentArb).filter((arb): arb is fc.Arbitrary<string> => arb !== null);
  return arbitraries.length === 0 ? null : fc.oneof(...arbitraries);
}

/**
 * Filtro de búsqueda: sin indicar (3 de 7), vacío o solo espacios, que cuenta como no indicado (1 de 7),
 * un fragmento del pivote (2 de 7, así el candidato también puede cumplir los demás filtros del pivote)
 * o un fragmento de cualquier elemento (1 de 7).
 */
function searchArb(allTexts: string[], pivotTexts: string[]): fc.Arbitrary<string | undefined> {
  const choices: fc.WeightedArbitrary<string | undefined>[] = [
    { arbitrary: fc.constant(undefined), weight: 3 },
    { arbitrary: fc.constantFrom('', '   '), weight: 1 },
  ];
  const fromPivot = fragmentsOf(pivotTexts);
  const fromAny = fragmentsOf(allTexts);
  if (fromPivot) choices.push({ arbitrary: fromPivot, weight: 2 });
  if (fromAny) choices.push({ arbitrary: fromAny, weight: 1 });
  return fc.oneof(...choices);
}

// ---------- Registros genéricos (Empleados, Pacientes, auditoría, mantenimiento, ocupación) ----------

interface Row {
  id: number;
  role: string;
  departmentId: number | null;
  shift: string;
  status: string;
  action: string;
  userId: number | null;
  open: boolean;
  /** Motivo_de_Liberación: null en una Asignación activa. */
  reason: string | null;
  name: string;
  internalId: string;
  date: Date | null;
}

interface RowFilters {
  role?: string;
  departmentId?: number;
  shift?: string;
  status?: string;
  action?: string;
  userId?: number;
  open?: boolean;
  reason?: string;
  search?: string;
  from?: Date;
  to?: Date;
}

const ACTIONS = AUDIT_ACTIONS.slice(0, 4);

const rowsArb = fc.array(
  fc.record({
    role: fc.constantFrom(...ROLES),
    departmentId: fc.option(fc.integer({ min: 1, max: 3 }), { nil: null }),
    shift: fc.constantFrom(...SHIFTS),
    status: fc.constantFrom(...PATIENT_STATUSES),
    action: fc.constantFrom(...ACTIONS),
    userId: fc.option(fc.integer({ min: 1, max: 3 }), { nil: null }),
    open: fc.boolean(),
    reason: fc.option(fc.constantFrom(...RELEASE_REASONS), { nil: null }),
    name: textArb(8),
    internalId: fc.integer({ min: 0, max: 999 }).map((n) => `EMP-${String(n).padStart(3, '0')}`),
    date: fc.option(dateArb, { nil: null }),
  }),
  { maxLength: 30 },
);

const rowScenarioArb = rowsArb.chain((raw) => {
  const rows: Row[] = raw.map((row, id) => ({ id, ...row }));
  const filtersArb = pivotArb(rows).chain(
    (p): fc.Arbitrary<RowFilters> =>
      fc.record(
        {
          role: opt(fc.constantFrom(...ROLES), p?.role),
          departmentId: opt(fc.integer({ min: 1, max: 4 }), p?.departmentId),
          shift: opt(fc.constantFrom(...SHIFTS), p?.shift),
          status: opt(fc.constantFrom(...PATIENT_STATUSES), p?.status),
          action: opt(fc.constantFrom(...ACTIONS), p?.action),
          userId: opt(fc.integer({ min: 1, max: 4 }), p?.userId),
          open: opt(fc.boolean(), p?.open),
          reason: opt(fc.constantFrom(...RELEASE_REASONS), p?.reason),
          search: searchArb(rows.flatMap((r) => [r.name, r.internalId]), p ? [p.name, p.internalId] : []),
          from: opt(dateArb, p?.date),
          to: opt(dateArb, p?.date),
        },
        { requiredKeys: [] },
      ),
  );
  return filtersArb.map((filters) => ({ kind: 'rows' as const, rows, filters }));
});

const rowCriteria = (f: RowFilters): Criterion<Row>[] => [
  equals((r: Row) => r.role, f.role),
  equals((r: Row) => r.departmentId, f.departmentId),
  equals((r: Row) => r.shift, f.shift),
  equals((r: Row) => r.status, f.status),
  equals((r: Row) => r.action, f.action),
  equals((r: Row) => r.userId, f.userId),
  equals((r: Row) => r.open, f.open),
  equals((r: Row) => r.reason, f.reason),
  search((r: Row) => [r.name, r.internalId], f.search),
  dateRange((r: Row) => r.date, { from: f.from, to: f.to }),
];

function rowOracle(r: Row, f: RowFilters): boolean {
  const term = givenTerm(f.search);
  return (
    eq(f.role, r.role) &&
    eq(f.departmentId, r.departmentId) &&
    eq(f.shift, r.shift) &&
    eq(f.status, r.status) &&
    eq(f.action, r.action) &&
    eq(f.userId, r.userId) &&
    eq(f.open, r.open) &&
    eq(f.reason, r.reason) &&
    (term === null || containsIgnoringCase(r.name, term) || containsIgnoringCase(r.internalId, term)) &&
    inInclusiveRange(r.date, f.from, f.to)
  );
}

// ---------- Productos (Req. 7.9, 22.6) ----------

type Product = ProductLike & { id: number };

const productOfArb = (category: (typeof PRODUCT_CATEGORIES)[number]): fc.Arbitrary<ProductLike> =>
  fc.record({
    name: textArb(8),
    category: fc.constant(category),
    classification:
      category === 'insumo médico'
        ? fc.constantFrom(...SUPPLY_SUBCATEGORIES)
        : category === 'medicamento'
          ? fc.constantFrom(...MEDICATION_TYPES)
          : fc.constantFrom('desinfectante', 'detergente'),
    quantity: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 20 })),
    minStock: fc.integer({ min: 0, max: 20 }),
    supplierId: fc.integer({ min: 1, max: 3 }),
    medicationInfo:
      category === 'medicamento'
        ? fc.record({
            type: fc.constantFrom(...MEDICATION_TYPES),
            controlClass: fc.constantFrom(...CONTROL_CLASSES),
            requiresPrescription: fc.boolean(),
          })
        : fc.constant(null),
  });

/** Siempre hay al menos un insumo médico y un medicamento, en posiciones al azar. */
const productsArb = fc
  .tuple(
    productOfArb('insumo médico'),
    productOfArb('medicamento'),
    fc.array(fc.constantFrom(...PRODUCT_CATEGORIES).chain(productOfArb), { maxLength: 28 }),
    fc.nat(),
    fc.nat(),
  )
  .map(([supply, medication, rest, i, j]) => {
    const list = [...rest];
    list.splice(i % (list.length + 1), 0, supply);
    list.splice(j % (list.length + 1), 0, medication);
    return list;
  });

const productScenarioArb = productsArb.chain((raw) => {
  const rows: Product[] = raw.map((product, id) => ({ id, ...product }));
  const filtersArb = pivotArb(rows).chain((p): fc.Arbitrary<ProductFilters> => {
    const med = p?.medicationInfo ?? undefined;
    return fc.record(
      {
        category: opt(fc.constantFrom(...PRODUCT_CATEGORIES), p?.category),
        subcategory: opt(
          fc.constantFrom(...SUPPLY_SUBCATEGORIES, 'genérico'),
          p?.category === 'insumo médico' ? p.classification : undefined,
        ),
        availability: opt(
          fc.constantFrom(...PRODUCT_AVAILABILITY),
          p === undefined ? undefined : p.quantity === 0 ? ('agotado' as const) : ('disponible' as const),
        ),
        lowStock: opt(fc.boolean(), p === undefined ? undefined : p.quantity <= p.minStock),
        supplierId: opt(fc.integer({ min: 1, max: 4 }), p?.supplierId),
        medicationType: opt(fc.constantFrom(...MEDICATION_TYPES), med?.type),
        controlClass: opt(fc.constantFrom(...CONTROL_CLASSES), med?.controlClass),
        // Con un pivote que no es medicamento se usa `false`: es el caso en que la regla "los filtros
        // de medicamento solo devuelven medicamentos" (tarea 3.5) excluye al pivote.
        requiresPrescription: opt(fc.boolean(), p === undefined ? undefined : (med?.requiresPrescription ?? false)),
        controlled: opt(fc.boolean(), p === undefined ? undefined : med === undefined ? false : med.controlClass === 'controlado'),
        search: searchArb(
          rows.map((r) => r.name),
          p ? [p.name] : [],
        ),
      },
      { requiredKeys: [] },
    );
  });
  return filtersArb.map((filters) => ({ kind: 'products' as const, rows, filters }));
});

function productOracle(p: Product, f: ProductFilters): boolean {
  const med = p.medicationInfo ?? null;
  const term = givenTerm(f.search);
  return (
    eq(f.category, p.category) &&
    // Subcategoría_de_Insumo: solo la tienen los insumos médicos.
    (f.subcategory === undefined || (p.category === 'insumo médico' && p.classification === f.subcategory)) &&
    // Disponibilidad: "agotado" si la cantidad es cero (Req. 7.4).
    (f.availability === undefined || (p.quantity === 0 ? 'agotado' : 'disponible') === f.availability) &&
    // Stock_Bajo: cantidad menor o igual que el mínimo (Req. 7.3).
    (f.lowStock === undefined || p.quantity <= p.minStock === f.lowStock) &&
    eq(f.supplierId, p.supplierId) &&
    // Filtros de medicamento: solo los cumplen productos con datos de medicamento (tarea 3.5).
    (f.medicationType === undefined || (med !== null && med.type === f.medicationType)) &&
    (f.controlClass === undefined || (med !== null && med.controlClass === f.controlClass)) &&
    (f.requiresPrescription === undefined || (med !== null && med.requiresPrescription === f.requiresPrescription)) &&
    (f.controlled === undefined || (med !== null && (med.controlClass === 'controlado') === f.controlled)) &&
    (term === null || containsIgnoringCase(p.name, term))
  );
}

// ---------- Movimientos_de_Inventario (Req. 25.5) ----------

type Movement = MovementLike & { id: number };

const movementsArb = fc.array(
  fc.record({
    productId: fc.integer({ min: 1, max: 3 }),
    type: fc.constantFrom(...INVENTORY_MOVEMENT_TYPES),
    userId: fc.integer({ min: 1, max: 3 }),
    createdAt: dateArb,
    product: fc.record({ category: fc.constantFrom(...PRODUCT_CATEGORIES) }),
  }),
  { maxLength: 30 },
);

const movementScenarioArb = movementsArb.chain((raw) => {
  const rows: Movement[] = raw.map((movement, id) => ({ id, ...movement }));
  const filtersArb = pivotArb(rows).chain(
    (p): fc.Arbitrary<MovementFilters> =>
      fc.record(
        {
          productId: opt(fc.integer({ min: 1, max: 4 }), p?.productId),
          category: opt(fc.constantFrom(...PRODUCT_CATEGORIES), p?.product.category),
          type: opt(fc.constantFrom(...INVENTORY_MOVEMENT_TYPES), p?.type),
          userId: opt(fc.integer({ min: 1, max: 4 }), p?.userId),
          from: opt(dateArb, p?.createdAt),
          to: opt(dateArb, p?.createdAt),
        },
        { requiredKeys: [] },
      ),
  );
  return filtersArb.map((filters) => ({ kind: 'movements' as const, rows, filters }));
});

function movementOracle(m: Movement, f: MovementFilters): boolean {
  return (
    eq(f.productId, m.productId) &&
    eq(f.category, m.product.category) &&
    eq(f.type, m.type) &&
    eq(f.userId, m.userId) &&
    inInclusiveRange(m.createdAt, f.from, f.to)
  );
}

// ---------- Comprobación común ----------

const scenarioArb = fc.oneof(rowScenarioArb, productScenarioArb, movementScenarioArb);

const ids = (rows: readonly { id: number }[]) => rows.map((row) => row.id);

/**
 * Comprueba un escenario con los criterios de la implementación y el oráculo del tipo de colección:
 * - el resultado son exactamente los elementos que cumplen el oráculo, en el orden de entrada
 *   (si ninguno coincide, el oráculo da una lista vacía y el resultado también);
 * - AND: el resultado es la intersección de aplicar cada criterio por separado, así que quien
 *   incumple al menos un criterio queda fuera;
 * - sin filtros (lista vacía o todos sin valor) se devuelven todos, en el mismo orden;
 * - el resultado es una lista nueva y la entrada no se modifica.
 */
function checkScenario<T extends { id: number }>(
  rows: T[],
  criteria: Criterion<T>[],
  noFilters: Criterion<T>[],
  oracle: (row: T) => boolean,
): void {
  const before = structuredClone(rows);
  const result = applyFilters(rows, criteria);

  expect(ids(result)).toEqual(ids(rows.filter(oracle)));

  const perCriterion = criteria.map((criterion) => new Set(ids(applyFilters(rows, [criterion]))));
  expect(ids(result)).toEqual(ids(rows).filter((id) => perCriterion.every((set) => set.has(id))));

  expect(ids(applyFilters(rows, []))).toEqual(ids(rows));
  expect(ids(applyFilters(rows, noFilters))).toEqual(ids(rows));

  expect(result).not.toBe(rows);
  expect(rows).toEqual(before);
}

// ---------- Propiedad (100 casos generados) ----------

describe('Filtros (propiedades)', () => {
  // Feature: hospital-management-system, Property 6: Los filtros se combinan con AND
  it('Property 6: applyFilters devuelve exactamente los elementos que cumplen todos los filtros indicados', () => {
    fc.assert(
      fc.property(scenarioArb, (scenario) => {
        switch (scenario.kind) {
          case 'rows':
            checkScenario(scenario.rows, rowCriteria(scenario.filters), rowCriteria({}), (r) => rowOracle(r, scenario.filters));
            break;
          case 'products':
            checkScenario(scenario.rows, productCriteria(scenario.filters), productCriteria({}), (p) =>
              productOracle(p, scenario.filters),
            );
            break;
          case 'movements':
            checkScenario(scenario.rows, movementCriteria(scenario.filters), movementCriteria({}), (m) =>
              movementOracle(m, scenario.filters),
            );
            break;
        }
      }),
      RUNS,
    );
  });
});

// ---------- Casos deterministas complementarios de Property 6 ----------

const row = (id: number, values: Partial<Omit<Row, 'id'>>): Row => ({
  id,
  role: 'DOCTOR',
  departmentId: 1,
  shift: 'matutino',
  status: 'activo',
  action: ACTIONS[0] as string,
  userId: 1,
  open: false,
  reason: null,
  name: `Persona ${id}`,
  internalId: `EMP-${String(100 + id)}`,
  date: new Date('2026-01-01T12:00:00Z'),
  ...values,
});

const movement = (id: number, createdAt: string): Movement => ({
  id,
  productId: 1,
  type: 'entrada',
  userId: 1,
  createdAt: new Date(createdAt),
  product: { category: 'medicamento' },
});

const product = (id: number, values: Partial<ProductLike>): Product => ({
  id,
  name: `Producto ${id}`,
  category: 'medicamento',
  classification: 'genérico',
  quantity: 10,
  minStock: 1,
  supplierId: 1,
  medicationInfo: null,
  ...values,
});

describe('Property 6: casos deterministas complementarios', () => {
  it('combina con AND: un elemento que cumple solo uno de dos filtros queda fuera (detecta OR)', () => {
    const rows = [
      row(0, { role: 'NURSE', departmentId: 1 }),
      row(1, { role: 'NURSE', departmentId: 2 }),
      row(2, { role: 'DOCTOR', departmentId: 1 }),
      row(3, { role: 'DOCTOR', departmentId: 2 }),
    ];
    const filters: RowFilters = { role: 'NURSE', departmentId: 1 };
    expect(ids(applyFilters(rows, rowCriteria(filters)))).toEqual([0]);

    const occupancy = [
      row(0, { departmentId: 1, reason: 'alta' }),
      row(1, { departmentId: 1, reason: null }),
      row(2, { departmentId: 2, reason: 'alta' }),
    ];
    expect(ids(applyFilters(occupancy, rowCriteria({ departmentId: 1, reason: 'alta' })))).toEqual([0]);

    checkScenario(rows, rowCriteria(filters), rowCriteria({}), (r) => rowOracle(r, filters));
  });

  it('el último día del rango se incluye completo, a cualquier hora (detecta fin de rango exclusivo)', () => {
    const rows = [
      movement(0, '2026-01-05T00:00:00Z'),
      movement(1, '2026-01-05T18:30:00Z'),
      movement(2, '2026-01-06T00:00:00Z'),
      movement(3, '2026-01-04T23:59:59Z'),
      movement(4, '2026-01-03T10:00:00Z'),
    ];
    const sameDay: MovementFilters = { from: new Date('2026-01-05T09:00:00Z'), to: new Date('2026-01-05T00:00:00Z') };
    expect(ids(applyFilters(rows, movementCriteria(sameDay)))).toEqual([0, 1]);
    const twoDays: MovementFilters = { from: new Date('2026-01-04T00:00:00Z'), to: new Date('2026-01-05T00:00:00Z') };
    expect(ids(applyFilters(rows, movementCriteria(twoDays)))).toEqual([0, 1, 3]);

    checkScenario(rows, movementCriteria(twoDays), movementCriteria({}), (m) => movementOracle(m, twoDays));
  });

  it('la búsqueda no distingue mayúsculas y se combina con los demás filtros (detecta búsqueda sensible)', () => {
    const rows = [
      row(0, { name: 'Ángela Ruiz', internalId: 'EMP-001', role: 'DOCTOR' }),
      row(1, { name: 'ángela peña', internalId: 'EMP-002', role: 'NURSE' }),
      row(2, { name: 'Luis Ortega', internalId: 'ENF-010', role: 'DOCTOR' }),
    ];
    const byName: RowFilters = { search: 'áNGEL', role: 'DOCTOR' };
    expect(ids(applyFilters(rows, rowCriteria(byName)))).toEqual([0]);
    expect(ids(applyFilters(rows, rowCriteria({ search: 'emp-00' })))).toEqual([0, 1]);
    expect(ids(applyFilters(rows, rowCriteria({ search: 'ORTEGA', role: 'DOCTOR' })))).toEqual([2]);

    const products = [product(0, { name: 'Paracetamol' }), product(1, { name: 'Ibuprofeno' })];
    expect(ids(applyFilters(products, productCriteria({ search: 'PARACET' })))).toEqual([0]);

    checkScenario(rows, rowCriteria(byName), rowCriteria({}), (r) => rowOracle(r, byName));
  });

  it('controlled=false devuelve solo medicamentos no controlados, nunca insumos (detecta insumos incluidos)', () => {
    const products = [
      product(0, { category: 'insumo médico', classification: 'jeringa', medicationInfo: null }),
      product(1, { medicationInfo: { type: 'genérico', controlClass: 'venta libre', requiresPrescription: false } }),
      product(2, { medicationInfo: { type: 'de patente', controlClass: 'controlado', requiresPrescription: true } }),
      product(3, { category: 'material de limpieza', classification: 'desinfectante', medicationInfo: null }),
    ];
    const notControlled: ProductFilters = { controlled: false };
    expect(ids(applyFilters(products, productCriteria(notControlled)))).toEqual([1]);
    expect(ids(applyFilters(products, productCriteria({ controlled: true })))).toEqual([2]);
    expect(ids(applyFilters(products, productCriteria({ controlled: false, supplierId: 1 })))).toEqual([1]);

    checkScenario(products, productCriteria(notControlled), productCriteria({}), (p) => productOracle(p, notControlled));
  });
});
