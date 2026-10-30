import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { NewTag } from "../db/schema.js";
import { type MovementsRepo, makeMovementsRepo } from "../movements/movements.repository.js";
import { type TemplatesRepo, makeTemplatesRepo } from "./templates.repository.js";

function seedTestTags(testDb: DbClient) {
  const insert = (data: NewTag) => {
    const row = testDb.insert(schema.tags).values(data).returning().all()[0];
    if (!row) throw new Error("Failed to insert seed tag");
    return row;
  };
  return {
    fijo: insert({ kind: "tipo", nombre: "Fijo", color: "#6366f1" }),
    variable: insert({ kind: "tipo", nombre: "Variable", color: "#f59e0b" }),
    concepto: insert({ kind: "concepto", nombre: "Gas", color: "#f97316" }),
    conceptoSueldo: insert({ kind: "concepto", nombre: "Sueldo", color: "#34d399" }),
    pagado: insert({ kind: "estado", nombre: "Pagado", color: "#22c55e" }),
    adeudado: insert({ kind: "estado", nombre: "Adeudado", color: "#ef4444" }),
    deshabilitado: insert({ kind: "estado", nombre: "Deshabilitado", color: "#94a3b8" }),
    medioPago: insert({ kind: "medio_pago", nombre: "Tarjeta", color: "#999999" }),
    persona: insert({ kind: "persona", nombre: "Luciano", color: "#888888" }),
  };
}

let templatesRepo: TemplatesRepo;
let movementsRepo: MovementsRepo;
let sqlite: Database;
let testDb: DbClient;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  templatesRepo = makeTemplatesRepo(testDb);
  movementsRepo = makeMovementsRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("generateMonthFromPrevious — copia de fijos", () => {
  test("copia movement Fijo del mes anterior con fecha actualizada y estado Adeudado", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 5000, detalle: "Gas mayo" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    const created = result.created[0];
    expect(created?.fecha).toBe("2026-06-15");
    const tagNames = created?.tags.map((t) => t.nombre) ?? [];
    expect(tagNames).toContain("Adeudado");
    expect(tagNames).not.toContain("Pagado");
    expect(tagNames).toContain("Fijo");
    expect(tagNames).toContain("Gas");
  });

  test("clamp de fin de mes: 31 de enero -> 28 de febrero (no bisiesto)", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-01-31", direccion: "out", monto_total: 1000, detalle: "Gas enero" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 2);

    expect(result.created.length).toBe(1);
    expect(result.created[0]?.fecha).toBe("2026-02-28");
  });

  test("clamp de fin de mes: 31 de enero -> 29 de febrero (bisiesto)", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2024-01-31", direccion: "out", monto_total: 1000, detalle: "Gas enero" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2024, 2);

    expect(result.created.length).toBe(1);
    expect(result.created[0]?.fecha).toBe("2024-02-29");
  });

  test("variables (sin tag Fijo) no se copian", () => {
    const { variable, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-05-10", direccion: "out", monto_total: 2000, detalle: "Super mayo" },
      [variable.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(0);
  });

  test("ingresos fijos también se copian", () => {
    const { fijo, conceptoSueldo, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-05-05", direccion: "in", monto_total: 150000, detalle: "Sueldo mayo" },
      [fijo.id, conceptoSueldo.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    expect(result.created[0]?.direccion).toBe("in");
  });

  test("un fijo Deshabilitado se clona con estado Adeudado (deshabilitar es por mes, no permanente)", () => {
    const { fijo, concepto, deshabilitado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 91200, detalle: "Tarjeta - Heladera" },
      [fijo.id, concepto.id, deshabilitado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    const tagNames = result.created[0]?.tags.map((t) => t.nombre) ?? [];
    expect(tagNames).toContain("Adeudado");
    expect(tagNames).not.toContain("Deshabilitado");
  });
});

describe("generateMonthFromPrevious — idempotencia", () => {
  test("reejecutar no duplica", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    const source = movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 5000, detalle: "Gas mayo" },
      [fijo.id, concepto.id, pagado.id]
    );

    const first = templatesRepo.generateMonthFromPrevious(2026, 6);
    expect(first.created.length).toBe(1);
    expect(first.skipped.length).toBe(0);

    const second = templatesRepo.generateMonthFromPrevious(2026, 6);
    expect(second.created.length).toBe(0);
    expect(second.skipped.length).toBe(1);
    expect(second.skipped[0]?.source_movement_id).toBe(source.id);

    const destinoMovs = movementsRepo.listMovementsByDateRange("2026-06-01", "2026-06-30");
    expect(destinoMovs.length).toBe(1);
  });
});

describe("generateMonthFromPrevious — preservación de campos", () => {
  test("conserva regla_op/regla_factor/monto_efectivo", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      {
        fecha: "2026-05-15",
        direccion: "out",
        monto_total: 31000,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Compartido",
      },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    const created = result.created[0];
    expect(created?.regla_op).toBe("div");
    expect(created?.regla_factor).toBe(2);
    expect(created?.monto_efectivo).toBe(15500);
  });

  test("conserva tags de concepto/medio_pago/persona", () => {
    const { fijo, concepto, pagado, medioPago, persona } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 5000, detalle: "Gas mayo" },
      [fijo.id, concepto.id, pagado.id, medioPago.id, persona.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    const tagNames = result.created[0]?.tags.map((t) => t.nombre) ?? [];
    expect(tagNames.sort()).toEqual(["Adeudado", "Fijo", "Gas", "Luciano", "Tarjeta"].sort());
  });

  test("installment_id no se copia", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      {
        fecha: "2026-05-15",
        direccion: "out",
        monto_total: 5000,
        detalle: "Cuota mayo",
        installment_id: 42,
      },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    expect(result.created[0]?.installment_id).toBeNull();
  });

  test("source_movement_id apunta al movement origen", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    const source = movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 5000, detalle: "Gas mayo" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(1);
    expect(result.created[0]?.source_movement_id).toBe(source.id);
  });
});

describe("generateMonthFromPrevious — casos borde", () => {
  test("tag Adeudado no existe -> error claro", () => {
    const insert = (data: NewTag) => {
      const row = testDb.insert(schema.tags).values(data).returning().all()[0];
      if (!row) throw new Error("Failed to insert seed tag");
      return row;
    };
    const fijo = insert({ kind: "tipo", nombre: "Fijo", color: "#6366f1" });
    const concepto = insert({ kind: "concepto", nombre: "Gas", color: "#f97316" });
    const pagado = insert({ kind: "estado", nombre: "Pagado", color: "#22c55e" });
    movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 5000, detalle: "Gas mayo" },
      [fijo.id, concepto.id, pagado.id]
    );

    expect(() => templatesRepo.generateMonthFromPrevious(2026, 6)).toThrow(/Adeudado/);
  });

  test("mes anterior sin movimientos fijos -> resultado vacío sin error", () => {
    seedTestTags(testDb);

    const result = templatesRepo.generateMonthFromPrevious(2026, 6);

    expect(result.created.length).toBe(0);
    expect(result.skipped.length).toBe(0);
  });

  test("diciembre -> enero (cambio de año)", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2025-12-10", direccion: "out", monto_total: 1000, detalle: "Gas diciembre" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = templatesRepo.generateMonthFromPrevious(2026, 1);

    expect(result.sourceYear).toBe(2025);
    expect(result.sourceMonth).toBe(12);
    expect(result.targetYear).toBe(2026);
    expect(result.targetMonth).toBe(1);
    expect(result.created[0]?.fecha).toBe("2026-01-10");
  });
});
