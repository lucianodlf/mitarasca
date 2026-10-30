import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { NewTag } from "../db/schema.js";
import { type MovementsRepo, makeRepo, requiresShares } from "./movements.repository.js";

function seedTestTags(testDb: DbClient) {
  const insert = (data: NewTag) => {
    const row = testDb.insert(schema.tags).values(data).returning().all()[0];
    if (!row) throw new Error("Failed to insert seed tag");
    return row;
  };
  return {
    tipo: insert({ kind: "tipo", nombre: "Fijo", color: "#6366f1" }),
    concepto: insert({ kind: "concepto", nombre: "Gas", color: "#f97316" }),
    pagado: insert({ kind: "estado", nombre: "Pagado", color: "#22c55e" }),
    adeudado: insert({ kind: "estado", nombre: "Adeudado", color: "#ef4444" }),
    deshabilitado: insert({ kind: "estado", nombre: "Deshabilitado", color: "#94a3b8" }),
  };
}

let repo: MovementsRepo;
let sqlite: Database;
let testDb: DbClient;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  repo = makeRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("Movement CRUD", () => {
  test("crea un egreso con tags y lo recupera por id", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 5000, detalle: "Gas junio" },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.id).toBeGreaterThan(0);
    expect(m.direccion).toBe("out");
    expect(m.monto_efectivo).toBe(5000);
    expect(m.tags.length).toBe(3);

    const found = repo.getMovementById(m.id);
    expect(found).toBeDefined();
    expect(found?.detalle).toBe("Gas junio");
    expect(found?.tags.length).toBe(3);
  });

  test("crea un ingreso con tags y lo recupera por id", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-05", direccion: "in", monto_total: 150000, detalle: "Sueldo" },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.direccion).toBe("in");
    expect(m.monto_total).toBe(150000);
    expect(m.monto_efectivo).toBe(150000);
  });

  test("getLastMovement retorna undefined sin movimientos", () => {
    expect(repo.getLastMovement()).toBeUndefined();
  });

  test("getLastMovement retorna el de fecha más reciente", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const tagIds = [tipo.id, concepto.id, pagado.id];
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Primero" },
      tagIds
    );
    repo.createMovement(
      { fecha: "2026-06-15", direccion: "out", monto_total: 300, detalle: "Último" },
      tagIds
    );

    const last = repo.getLastMovement();
    expect(last?.detalle).toBe("Último");
  });

  test("lista por rango de fechas — incluye en rango, excluye fuera", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const tagIds = [tipo.id, concepto.id, pagado.id];
    repo.createMovement(
      { fecha: "2026-05-31", direccion: "out", monto_total: 100, detalle: "Antes" },
      tagIds
    );
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 200, detalle: "Inicio" },
      tagIds
    );
    repo.createMovement(
      { fecha: "2026-06-15", direccion: "out", monto_total: 300, detalle: "Medio" },
      tagIds
    );
    repo.createMovement(
      { fecha: "2026-07-01", direccion: "out", monto_total: 400, detalle: "Después" },
      tagIds
    );

    const result = repo.listMovementsByDateRange("2026-06-01", "2026-06-30");
    expect(result.length).toBe(2);
    expect(result.map((m) => m.detalle).sort()).toEqual(["Inicio", "Medio"]);
  });

  test("lista por dirección in / out", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const tagIds = [tipo.id, concepto.id, pagado.id];
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Egreso" },
      tagIds
    );
    repo.createMovement(
      { fecha: "2026-06-02", direccion: "in", monto_total: 200, detalle: "Ingreso" },
      tagIds
    );

    const egresos = repo.listMovementsByDirection("out");
    const ingresos = repo.listMovementsByDirection("in");
    expect(egresos.length).toBe(1);
    expect(egresos[0]?.detalle).toBe("Egreso");
    expect(ingresos.length).toBe(1);
    expect(ingresos[0]?.detalle).toBe("Ingreso");
  });

  test("lista por tagId", () => {
    const { tipo, concepto, pagado, adeudado } = seedTestTags(testDb);
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Con pagado" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-02", direccion: "out", monto_total: 200, detalle: "Con adeudado" },
      [tipo.id, concepto.id, adeudado.id]
    );

    const result = repo.listMovementsByTag(pagado.id);
    expect(result.length).toBe(1);
    expect(result[0]?.detalle).toBe("Con pagado");
  });

  test("actualiza campos y reemplaza tags", () => {
    const { tipo, concepto, pagado, adeudado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Original" },
      [tipo.id, concepto.id, pagado.id]
    );

    const updated = repo.updateMovement(m.id, { detalle: "Actualizado", monto_total: 999 }, [
      tipo.id,
      concepto.id,
      adeudado.id,
    ]);
    expect(updated.detalle).toBe("Actualizado");
    expect(updated.monto_total).toBe(999);
    expect(updated.monto_efectivo).toBe(999);
    expect(updated.tags.map((t) => t.nombre)).toContain("Adeudado");
    expect(updated.tags.map((t) => t.nombre)).not.toContain("Pagado");
  });

  test("elimina movement y sus movement_tags", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "A eliminar" },
      [tipo.id, concepto.id, pagado.id]
    );
    const id = m.id;

    repo.deleteMovement(id);

    expect(repo.getMovementById(id)).toBeUndefined();
    const orphans = testDb
      .select()
      .from(schema.movement_tags)
      .where(eq(schema.movement_tags.movement_id, id))
      .all();
    expect(orphans.length).toBe(0);
  });

  test("elimina movement dividido y sus movement_shares", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-06-01",
        direccion: "out",
        monto_total: 300,
        regla_op: "div",
        regla_factor: 3,
        detalle: "Gas dividido a eliminar",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    const id = m.id;
    const sharesBefore = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, id))
      .all();
    expect(sharesBefore.length).toBe(2);

    repo.deleteMovement(id);

    expect(repo.getMovementById(id)).toBeUndefined();
    const orphanShares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, id))
      .all();
    expect(orphanShares.length).toBe(0);
  });
});

describe("Validación de tags", () => {
  test("rechaza movement sin tag tipo", () => {
    const { concepto, pagado } = seedTestTags(testDb);
    expect(() =>
      repo.createMovement(
        { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Test" },
        [concepto.id, pagado.id]
      )
    ).toThrow();
  });

  test("acepta movement sin tag concepto (concepto es 0..N)", () => {
    const { tipo, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Test" },
      [tipo.id, pagado.id]
    );
    expect(m.id).toBeNumber();
    expect(m.tags.map((t) => t.kind)).toContain("tipo");
    expect(m.tags.map((t) => t.kind)).toContain("estado");
  });

  test("rechaza movement sin tag estado", () => {
    const { tipo, concepto } = seedTestTags(testDb);
    expect(() =>
      repo.createMovement(
        { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Test" },
        [tipo.id, concepto.id]
      )
    ).toThrow();
  });

  test("rechaza movement con más de un tag estado", () => {
    const { tipo, concepto, pagado, adeudado } = seedTestTags(testDb);
    expect(() =>
      repo.createMovement(
        { fecha: "2026-06-01", direccion: "out", monto_total: 100, detalle: "Test" },
        [tipo.id, concepto.id, pagado.id, adeudado.id]
      )
    ).toThrow();
  });
});

describe("Sumarización", () => {
  test("proyectado suma todos los movimientos del mes", () => {
    const { tipo, concepto, pagado, adeudado } = seedTestTags(testDb);
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "in", monto_total: 10000, detalle: "Ingreso" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-15", direccion: "out", monto_total: 3000, detalle: "Egreso pagado" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-20", direccion: "out", monto_total: 2000, detalle: "Egreso adeudado" },
      [tipo.id, concepto.id, adeudado.id]
    );

    const result = repo.summarizeByMonth(2026, 6, "proyectado");
    expect(result.ingresos).toBe(10000);
    expect(result.egresos).toBe(5000);
    expect(result.balance).toBe(5000);
  });

  test("real suma solo los movimientos con estado Pagado", () => {
    const { tipo, concepto, pagado, adeudado } = seedTestTags(testDb);
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "in", monto_total: 10000, detalle: "Ingreso pagado" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-15", direccion: "out", monto_total: 3000, detalle: "Egreso pagado" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-20", direccion: "out", monto_total: 2000, detalle: "Egreso adeudado" },
      [tipo.id, concepto.id, adeudado.id]
    );

    const result = repo.summarizeByMonth(2026, 6, "real");
    expect(result.ingresos).toBe(10000);
    expect(result.egresos).toBe(3000);
    expect(result.balance).toBe(7000);
  });

  test("balance = ingresos - egresos", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "in", monto_total: 5000, detalle: "In" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-02", direccion: "out", monto_total: 1500, detalle: "Out" },
      [tipo.id, concepto.id, pagado.id]
    );

    const r = repo.summarizeByMonth(2026, 6, "proyectado");
    expect(r.balance).toBe(r.ingresos - r.egresos);
  });

  test("retorna ceros para mes sin movimientos", () => {
    const result = repo.summarizeByMonth(2025, 1, "proyectado");
    expect(result.ingresos).toBe(0);
    expect(result.egresos).toBe(0);
    expect(result.balance).toBe(0);
  });

  test("proyectado excluye movimientos con estado Deshabilitado", () => {
    const { tipo, concepto, pagado, deshabilitado } = seedTestTags(testDb);
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 3000, detalle: "Egreso pagado" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      { fecha: "2026-06-10", direccion: "out", monto_total: 91200, detalle: "Deshabilitado" },
      [tipo.id, concepto.id, deshabilitado.id]
    );

    const result = repo.summarizeByMonth(2026, 6, "proyectado");
    expect(result.egresos).toBe(3000);
  });

  test("proyectado sigue incluyendo movimientos sin ningún tag (NOT EXISTS no se comporta como innerJoin)", () => {
    const rows = testDb
      .insert(schema.movements)
      .values({
        fecha: "2026-06-05",
        direccion: "out",
        monto_total: 1000,
        regla_op: "none",
        regla_factor: null,
        monto_efectivo: 1000,
        detalle: "Sin tags",
      })
      .returning()
      .all();
    expect(rows.length).toBe(1);

    const result = repo.summarizeByMonth(2026, 6, "proyectado");
    expect(result.egresos).toBe(1000);
  });
});

describe("Regla operador + factor", () => {
  test("div/2 sobre Total $30.914 da monto_efectivo $15.457", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-06-01",
        direccion: "out",
        monto_total: 31000,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Compartido",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.monto_efectivo).toBe(15500);
    expect(m.regla_op).toBe("div");
    expect(m.regla_factor).toBe(2);
  });

  test("mul/5 sobre Total $5.000 da monto_efectivo $25.000", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-06-01",
        direccion: "out",
        monto_total: 5000,
        regla_op: "mul",
        regla_factor: 5,
        detalle: "Semanal",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.monto_efectivo).toBe(25000);
  });

  test("regla_op none pasa monto_total sin cambios", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 7500, detalle: "Normal" },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.monto_efectivo).toBe(7500);
    expect(m.regla_op).toBe("none");
    expect(m.regla_factor).toBeNull();
  });

  test("factor <= 0 lanza error", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    expect(() =>
      repo.createMovement(
        {
          fecha: "2026-06-01",
          direccion: "out",
          monto_total: 1000,
          regla_op: "div",
          regla_factor: 0,
          detalle: "Bad",
        },
        [tipo.id, concepto.id, pagado.id]
      )
    ).toThrow("factor debe ser > 0");

    expect(() =>
      repo.createMovement(
        {
          fecha: "2026-06-01",
          direccion: "out",
          monto_total: 1000,
          regla_op: "mul",
          regla_factor: -1,
          detalle: "Bad",
        },
        [tipo.id, concepto.id, pagado.id]
      )
    ).toThrow("factor debe ser > 0");
  });

  test("factor null con op distinta de none lanza error", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    expect(() =>
      repo.createMovement(
        {
          fecha: "2026-06-01",
          direccion: "out",
          monto_total: 1000,
          regla_op: "div",
          detalle: "No factor",
        },
        [tipo.id, concepto.id, pagado.id]
      )
    ).toThrow("factor debe ser > 0");
  });

  test("redondeo a 2 decimales (div/3 sobre 10)", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-06-01",
        direccion: "out",
        monto_total: 10,
        regla_op: "div",
        regla_factor: 3,
        detalle: "Tercio",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.monto_efectivo).toBe(3.33);
  });

  test("update recalcula monto_efectivo al cambiar regla", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 10000, detalle: "Update test" },
      [tipo.id, concepto.id, pagado.id]
    );
    expect(m.monto_efectivo).toBe(10000);

    const updated = repo.updateMovement(m.id, { regla_op: "div", regla_factor: 4 });
    expect(updated.monto_efectivo).toBe(2500);
  });

  test("sumarización usa monto_efectivo con regla aplicada", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    repo.createMovement(
      { fecha: "2026-06-01", direccion: "in", monto_total: 10000, detalle: "Ingreso" },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.createMovement(
      {
        fecha: "2026-06-05",
        direccion: "out",
        monto_total: 6000,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Compartido",
      },
      [tipo.id, concepto.id, pagado.id]
    );

    const result = repo.summarizeByMonth(2026, 6, "proyectado");
    expect(result.ingresos).toBe(10000);
    expect(result.egresos).toBe(3000);
    expect(result.balance).toBe(7000);
  });
});

describe("requiresShares", () => {
  test("true solo para egreso con div y factor > 1", () => {
    expect(requiresShares("out", "div", 2)).toBe(true);
    expect(requiresShares("out", "div", 1)).toBe(false);
    expect(requiresShares("out", "div", null)).toBe(false);
    expect(requiresShares("out", "none", null)).toBe(false);
    expect(requiresShares("out", "mul", 2)).toBe(false);
    expect(requiresShares("in", "div", 2)).toBe(false);
  });
});

describe("movement_shares sync", () => {
  test("crear un egreso dividido por 3 genera 2 shares vacías", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "out",
        monto_total: 300,
        regla_op: "div",
        regla_factor: 3,
        detalle: "Gas dividido",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    const shares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    expect(shares.length).toBe(2);
    expect(shares.every((s) => s.pagado === false && s.persona_tag_id === null)).toBe(true);
  });

  test("subir el factor de 2 a 3 agrega una share sin tocar la existente", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "out",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Gas",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    const [firstShare] = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    if (!firstShare) throw new Error("share esperada");
    testDb
      .update(schema.movement_shares)
      .set({ pagado: true })
      .where(eq(schema.movement_shares.id, firstShare.id))
      .run();

    repo.updateMovement(m.id, { regla_factor: 3 });

    const shares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    expect(shares.length).toBe(2);
    expect(shares.some((s) => s.id === firstShare.id && s.pagado === true)).toBe(true);
  });

  test("bajar el factor a 1 elimina todas las shares", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "out",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Gas",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    repo.updateMovement(m.id, { regla_op: "none", regla_factor: null });
    const shares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    expect(shares.length).toBe(0);
  });

  test("un ingreso con factor de división no genera shares", () => {
    const { tipo, concepto, pagado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "in",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Cobro",
      },
      [tipo.id, concepto.id, pagado.id]
    );
    const shares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    expect(shares.length).toBe(0);
  });
});

describe("toggleMovementEstado", () => {
  test("alterna entre Adeudado y Pagado preservando el resto de los tags", () => {
    const { tipo, concepto, adeudado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 500, detalle: "Manual" },
      [tipo.id, concepto.id, adeudado.id]
    );

    const paid = repo.toggleMovementEstado(m.id);
    const paidTagNames = paid.tags.map((t) => t.nombre);
    expect(paidTagNames).toContain("Pagado");
    expect(paidTagNames).not.toContain("Adeudado");
    expect(paidTagNames).toContain("Fijo");
    expect(paidTagNames).toContain("Gas");

    const reverted = repo.toggleMovementEstado(m.id);
    const revertedTagNames = reverted.tags.map((t) => t.nombre);
    expect(revertedTagNames).toContain("Adeudado");
    expect(revertedTagNames).not.toContain("Pagado");
  });

  test("lanza error sobre un movimiento deshabilitado y no modifica sus tags", () => {
    const { tipo, concepto, deshabilitado } = seedTestTags(testDb);
    const m = repo.createMovement(
      { fecha: "2026-06-01", direccion: "out", monto_total: 500, detalle: "Deshabilitado" },
      [tipo.id, concepto.id, deshabilitado.id]
    );

    expect(() => repo.toggleMovementEstado(m.id)).toThrow(
      "No se puede cambiar el estado de un movimiento deshabilitado"
    );

    const found = repo.getMovementById(m.id);
    expect(found?.tags.map((t) => t.nombre)).toContain("Deshabilitado");
  });
});

describe("listMovementShares / updateMovementShare", () => {
  test("actualiza persona y pagado de una share puntual", () => {
    const { tipo, concepto, adeudado } = seedTestTags(testDb);
    const persona = testDb
      .insert(schema.tags)
      .values({ kind: "persona", nombre: "Vecina", color: "#000000" })
      .returning()
      .all()[0];
    if (!persona) throw new Error("persona tag esperado");

    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "out",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "EPE",
      },
      [tipo.id, concepto.id, adeudado.id]
    );
    const [share] = repo.listMovementShares(m.id);
    if (!share) throw new Error("share esperada");

    const updated = repo.updateMovementShare(share.id, {
      persona_tag_id: persona.id,
      pagado: true,
    });
    expect(updated.persona_tag_id).toBe(persona.id);
    expect(updated.pagado).toBe(true);
    expect(updated.fecha_pago).not.toBeNull();
  });
});

describe("toggleMovementEstado y movement_shares", () => {
  test("pago_total_propio=false: pagar el movimiento marca todas las shares como pagadas", () => {
    const { tipo, concepto, adeudado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "out",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "EPE",
      },
      [tipo.id, concepto.id, adeudado.id]
    );
    testDb
      .update(schema.movements)
      .set({ pago_total_propio: false })
      .where(eq(schema.movements.id, m.id))
      .run();

    repo.toggleMovementEstado(m.id);

    const shares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    expect(shares.every((s) => s.pagado === true && s.fecha_pago !== null)).toBe(true);
  });

  test("pago_total_propio=true: pagar el movimiento no toca las shares", () => {
    const { tipo, concepto, adeudado } = seedTestTags(testDb);
    const m = repo.createMovement(
      {
        fecha: "2026-08-01",
        direccion: "out",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "Claro",
      },
      [tipo.id, concepto.id, adeudado.id]
    );
    testDb
      .update(schema.movements)
      .set({ pago_total_propio: true })
      .where(eq(schema.movements.id, m.id))
      .run();

    repo.toggleMovementEstado(m.id);

    const shares = testDb
      .select()
      .from(schema.movement_shares)
      .where(eq(schema.movement_shares.movement_id, m.id))
      .all();
    expect(shares.every((s) => s.pagado === false)).toBe(true);
  });
});

describe("shares_pendientes en listMovementsByDateRange", () => {
  test("true si hay al menos una share sin pagar, false si todas pagadas o no hay shares", () => {
    const { tipo, concepto, adeudado } = seedTestTags(testDb);
    const dividido = repo.createMovement(
      {
        fecha: "2026-08-05",
        direccion: "out",
        monto_total: 200,
        regla_op: "div",
        regla_factor: 2,
        detalle: "EPE",
      },
      [tipo.id, concepto.id, adeudado.id]
    );
    const simple = repo.createMovement(
      { fecha: "2026-08-05", direccion: "out", monto_total: 100, detalle: "Sin dividir" },
      [tipo.id, concepto.id, adeudado.id]
    );

    const list = repo.listMovementsByDateRange("2026-08-01", "2026-08-31");
    const dividido_row = list.find((m) => m.id === dividido.id);
    const simple_row = list.find((m) => m.id === simple.id);
    expect(dividido_row?.shares_pendientes).toBe(true);
    expect(simple_row?.shares_pendientes).toBe(false);

    const [share] = repo.listMovementShares(dividido.id);
    if (!share) throw new Error("share esperada");
    repo.updateMovementShare(share.id, { pagado: true });

    const list2 = repo.listMovementsByDateRange("2026-08-01", "2026-08-31");
    expect(list2.find((m) => m.id === dividido.id)?.shares_pendientes).toBe(false);
  });
});
