import { Database } from "bun:sqlite";
import { afterEach, beforeEach, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { NewTag } from "../db/schema.js";
import { makeMovementsRepo } from "../movements/movements.repository.js";
import { backfillDebtTags } from "./backfill-debt-tags.js";
import { makeDebtsRepo } from "./debts.repository.js";
import { makeInstallmentsRepo } from "./installments.repository.js";

let sqlite: Database;
let db: DbClient;

beforeEach(() => {
  sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

afterEach(() => {
  sqlite.close();
});

function tag(data: NewTag) {
  const row = db.insert(schema.tags).values(data).returning().all()[0];
  if (!row) throw new Error("Failed to insert tag");
  return row;
}

// Deuda de 2 cuotas con todos los tags; después se les quitan medio de pago y persona al
// movimiento de cada cuota, como quedaron las deudas anteriores a debtTagIds.
function seedLegacyDebt() {
  tag({ kind: "tipo", nombre: "Variable", color: "#f59e0b" });
  tag({ kind: "estado", nombre: "Adeudado", color: "#ef4444" });
  tag({ kind: "estado", nombre: "Pagado", color: "#22c55e" });
  const concepto = tag({ kind: "concepto", nombre: "Gas", color: "#f97316" });
  const medio = tag({ kind: "medio_pago", nombre: "Tarjeta", color: "#0ea5e9" });
  const beto = tag({ kind: "persona", nombre: "Beto", color: "#fb923c" });
  const ana = tag({ kind: "persona", nombre: "Ana", color: "#a78bfa" });
  const debt = makeDebtsRepo(db).createDebt({
    descripcion: "Deuda legacy",
    direccion: "yo_debo",
    medio_pago_tag_id: medio.id,
    concepto_tag_id: concepto.id,
    persona_tag_id: beto.id,
    importe_total: 2000,
    cant_cuotas: 2,
    fecha: "2026-01-15",
    fecha_inicio: "2026-01-15",
  });
  const movementIds = makeInstallmentsRepo(db)
    .listInstallmentsByDebt(debt.id)
    .map((i) => i.movement_id as number);
  db.delete(schema.movement_tags)
    .where(inArray(schema.movement_tags.movement_id, movementIds))
    .run();
  // El concepto sí estaba en el histórico; solo faltan medio de pago y persona.
  db.insert(schema.movement_tags)
    .values(movementIds.map((movement_id) => ({ movement_id, tag_id: concepto.id })))
    .run();
  return { movementIds, medio, beto, ana };
}

function tagIdsOf(movementId: number): number[] {
  return makeMovementsRepo(db)
    .getMovementById(movementId)
    ?.tags.map((t) => t.id) as number[];
}

test("dry-run reporta sin escribir", () => {
  const { movementIds } = seedLegacyDebt();
  const result = backfillDebtTags(db, { apply: false });
  expect(result).toEqual({ movements: 2, tags: 4 });
  for (const id of movementIds) expect(tagIdsOf(id)).toHaveLength(1);
});

test("apply agrega medio de pago y persona, y una segunda corrida no hace nada", () => {
  const { movementIds, medio, beto } = seedLegacyDebt();
  expect(backfillDebtTags(db, { apply: true })).toEqual({ movements: 2, tags: 4 });
  for (const id of movementIds) {
    expect(tagIdsOf(id)).toEqual(expect.arrayContaining([medio.id, beto.id]));
    expect(tagIdsOf(id)).toHaveLength(3);
  }
  expect(backfillDebtTags(db, { apply: true })).toEqual({ movements: 0, tags: 0 });
});

test("no agrega la persona de la deuda si el movimiento ya tiene otra persona", () => {
  const { movementIds, ana, beto } = seedLegacyDebt();
  const [first] = movementIds as [number];
  db.insert(schema.movement_tags).values({ movement_id: first, tag_id: ana.id }).run();
  backfillDebtTags(db, { apply: true });
  expect(tagIdsOf(first)).toContain(ana.id);
  expect(tagIdsOf(first)).not.toContain(beto.id);
  expect(
    db.select().from(schema.movement_tags).where(eq(schema.movement_tags.movement_id, first)).all()
  ).toHaveLength(3);
});
