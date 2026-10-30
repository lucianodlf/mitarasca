import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { Movement } from "../db/schema.js";
import { type DedupRepo, makeDedupRepo } from "./dedup.repository.js";

let sqlite: Database;
let testDb: DbClient;
let repo: DedupRepo;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  repo = makeDedupRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

/** Inserta un movimiento directo, sin pasar por el repo de movements. */
function insertMov(data: {
  fecha: string;
  direccion: "in" | "out";
  monto_total: number;
  detalle: string;
  monto_efectivo?: number;
  regla_op?: "div" | "mul" | "none";
  regla_factor?: number | null;
  source_image_hash?: string | null;
}): Movement {
  const row = testDb
    .insert(schema.movements)
    .values({
      fecha: data.fecha,
      direccion: data.direccion,
      monto_total: data.monto_total,
      monto_efectivo: data.monto_efectivo ?? data.monto_total,
      detalle: data.detalle,
      regla_op: data.regla_op ?? "none",
      regla_factor: data.regla_factor ?? null,
      source_image_hash: data.source_image_hash ?? null,
    })
    .returning()
    .all()[0];
  if (!row) throw new Error("No se pudo insertar el movimiento de prueba");
  return row;
}

describe("identityKey", () => {
  test("normaliza el detalle", () => {
    const a = repo.identityKey({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12500,
      detalle: "Super  COTO ",
    });
    const b = repo.identityKey({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12500,
      detalle: "super coto",
    });
    expect(a).toBe(b);
  });

  test("la dirección forma parte de la identidad", () => {
    const base = { fecha: "2026-06-14", monto_total: 12500, detalle: "x" };
    expect(repo.identityKey({ ...base, direccion: "in" })).not.toBe(
      repo.identityKey({ ...base, direccion: "out" })
    );
  });

  test("distingue el mismo monto_efectivo obtenido por reglas distintas", () => {
    // 10000 sin regla y 20000 ÷2 dan el mismo monto_efectivo pero no son lo mismo.
    const sinRegla = repo.identityKey({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 10000,
      detalle: "x",
    });
    const prorrateado = repo.identityKey({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 20000,
      detalle: "x",
      regla_op: "div",
      regla_factor: 2,
    });
    expect(sinRegla).not.toBe(prorrateado);
  });
});

describe("findExactInDb", () => {
  test("encuentra un movimiento con la misma clave de identidad", () => {
    const existente = insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12500,
      detalle: "Super Coto",
    });
    const hits = repo.findExactInDb({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12500,
      detalle: "super  coto",
    });
    expect(hits.map((h) => h.id)).toEqual([existente.id]);
  });

  test("no matchea si difiere la fecha", () => {
    insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 12500, detalle: "Super" });
    const hits = repo.findExactInDb({
      fecha: "2026-06-15",
      direccion: "out",
      monto_total: 12500,
      detalle: "Super",
    });
    expect(hits).toHaveLength(0);
  });

  test("no matchea si difiere el monto", () => {
    insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 12500, detalle: "Super" });
    const hits = repo.findExactInDb({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12501,
      detalle: "Super",
    });
    expect(hits).toHaveLength(0);
  });
});

describe("findExactPairs", () => {
  test("dos movimientos idénticos de imágenes distintas forman un par", () => {
    const a = insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12500,
      detalle: "Super Coto",
      source_image_hash: "hash-a",
    });
    const b = insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 12500,
      detalle: "Super Coto",
      source_image_hash: "hash-b",
    });
    const pares = repo.findExactPairs("2026-06-01", "2026-06-30");
    expect(pares).toHaveLength(1);
    expect([pares[0]?.a.id, pares[0]?.b.id].sort()).toEqual([a.id, b.id].sort());
  });

  test("dos movimientos idénticos de la MISMA imagen no forman par", () => {
    // Son dos operaciones reales que la billetera listó por separado
    // (dos compras iguales el mismo día en el mismo comercio).
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 3000,
      detalle: "Cerveza",
      source_image_hash: "misma-imagen",
    });
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 3000,
      detalle: "Cerveza",
      source_image_hash: "misma-imagen",
    });
    expect(repo.findExactPairs("2026-06-01", "2026-06-30")).toHaveLength(0);
  });

  test("un importado y un manual con la misma clave sí forman par", () => {
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 3000,
      detalle: "Cerveza",
      source_image_hash: "hash-a",
    });
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 3000,
      detalle: "Cerveza",
    });
    expect(repo.findExactPairs("2026-06-01", "2026-06-30")).toHaveLength(1);
  });

  test("respeta el rango de fechas", () => {
    insertMov({ fecha: "2026-05-30", direccion: "out", monto_total: 100, detalle: "x" });
    insertMov({ fecha: "2026-05-30", direccion: "out", monto_total: 100, detalle: "x" });
    expect(repo.findExactPairs("2026-06-01", "2026-06-30")).toHaveLength(0);
  });

  test("tres idénticos de imágenes distintas producen tres pares", () => {
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 100,
      detalle: "x",
      source_image_hash: "a",
    });
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 100,
      detalle: "x",
      source_image_hash: "b",
    });
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 100,
      detalle: "x",
      source_image_hash: "c",
    });
    expect(repo.findExactPairs("2026-06-01", "2026-06-30")).toHaveLength(3);
  });
});

describe("recordFinding", () => {
  test("persiste un finding nuevo en estado pendiente", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const b = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const f = repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      movement_b_id: b.id,
      motivo: "clave de identidad idéntica",
    });
    expect(f.nuevo).toBe(true);
    expect(f.estado).toBe("pendiente");
    expect(f.detectado_en).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("re-registrar el mismo par no duplica ni pisa el estado", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const b = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const primero = repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      movement_b_id: b.id,
      motivo: "clave de identidad idéntica",
    });
    repo.updateFindingEstado(primero.id, "confirmado");

    const segundo = repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      movement_b_id: b.id,
      motivo: "clave de identidad idéntica",
    });
    expect(segundo.nuevo).toBe(false);
    expect(segundo.id).toBe(primero.id);
    expect(segundo.estado).toBe("confirmado");
    expect(repo.listFindings()).toHaveLength(1);
  });

  test("el mismo par en niveles distintos son findings distintos", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const b = insertMov({ fecha: "2026-06-17", direccion: "out", monto_total: 100, detalle: "y" });
    repo.recordFinding({ nivel: "exacto", movement_a_id: a.id, movement_b_id: b.id, motivo: "m" });
    repo.recordFinding({
      nivel: "reglas",
      movement_a_id: a.id,
      movement_b_id: b.id,
      motivo: "m",
      score: 0.1,
    });
    expect(repo.listFindings()).toHaveLength(2);
  });

  test("el par (a,b) y el par (b,a) son el mismo finding", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const b = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    repo.recordFinding({ nivel: "exacto", movement_a_id: a.id, movement_b_id: b.id, motivo: "m" });
    const segundo = repo.recordFinding({
      nivel: "exacto",
      movement_a_id: b.id,
      movement_b_id: a.id,
      motivo: "m",
    });
    expect(segundo.nuevo).toBe(false);
    expect(repo.listFindings()).toHaveLength(1);
  });

  test("guarda el candidato no insertado como JSON", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const candidato = {
      fecha: "2026-06-14",
      direccion: "out" as const,
      monto_total: 100,
      detalle: "x",
      source_image_hash: "hash-nuevo",
    };
    const f = repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      candidato_json: JSON.stringify(candidato),
      motivo: "coincide con un movimiento existente",
    });
    expect(f.movement_b_id).toBeNull();
    expect(JSON.parse(f.candidato_json ?? "{}")).toEqual(candidato);
  });

  test("dos candidatos distintos contra el mismo movimiento son findings distintos", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      motivo: "m",
      candidato_json: JSON.stringify({ source_image_hash: "img-1" }),
    });
    repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      motivo: "m",
      candidato_json: JSON.stringify({ source_image_hash: "img-2" }),
    });
    expect(repo.listFindings()).toHaveLength(2);
  });
});

describe("listFindings / updateFindingEstado", () => {
  test("filtra por estado", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const b = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const f = repo.recordFinding({
      nivel: "exacto",
      movement_a_id: a.id,
      movement_b_id: b.id,
      motivo: "m",
    });
    repo.updateFindingEstado(f.id, "descartado");
    expect(repo.listFindings({ estado: "pendiente" })).toHaveLength(0);
    expect(repo.listFindings({ estado: "descartado" })).toHaveLength(1);
  });

  test("borrar un movimiento arrastra sus findings (ON DELETE CASCADE)", () => {
    const a = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    const b = insertMov({ fecha: "2026-06-14", direccion: "out", monto_total: 100, detalle: "x" });
    repo.recordFinding({ nivel: "exacto", movement_a_id: a.id, movement_b_id: b.id, motivo: "m" });
    testDb.run("PRAGMA foreign_keys = ON");
    testDb.delete(schema.movements).where(eq(schema.movements.id, a.id)).run();
    expect(repo.listFindings()).toHaveLength(0);
  });
});

describe("findReflejos (nivel 2)", () => {
  test("detecta el par facturación/cobro con textos distintos", () => {
    insertMov({
      fecha: "2026-06-14",
      direccion: "in",
      monto_total: 85000,
      detalle: "Facturación junio",
    });
    insertMov({
      fecha: "2026-06-17",
      direccion: "in",
      monto_total: 85000,
      detalle: "Transf. MERPAGO",
    });
    const pares = repo.findReflejos("2026-06-01", "2026-06-30");
    expect(pares).toHaveLength(1);
    expect(pares[0]?.diasDiff).toBe(3);
    expect(pares[0]?.score).toBeLessThan(0.5);
  });

  test("no reporta pares fuera de la ventana de días", () => {
    insertMov({ fecha: "2026-06-01", direccion: "in", monto_total: 85000, detalle: "a" });
    insertMov({ fecha: "2026-06-20", direccion: "in", monto_total: 85000, detalle: "b" });
    expect(repo.findReflejos("2026-06-01", "2026-06-30")).toHaveLength(0);
  });

  test("la ventana es configurable", () => {
    insertMov({ fecha: "2026-06-01", direccion: "in", monto_total: 85000, detalle: "a" });
    insertMov({ fecha: "2026-06-20", direccion: "in", monto_total: 85000, detalle: "b" });
    expect(repo.findReflejos("2026-06-01", "2026-06-30", { ventanaDias: 30 })).toHaveLength(1);
  });

  test("no reporta pares que el nivel 1 ya considera espejo", () => {
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 100,
      detalle: "x",
      source_image_hash: "a",
    });
    insertMov({
      fecha: "2026-06-14",
      direccion: "out",
      monto_total: 100,
      detalle: "x",
      source_image_hash: "b",
    });
    expect(repo.findExactPairs("2026-06-01", "2026-06-30")).toHaveLength(1);
    expect(repo.findReflejos("2026-06-01", "2026-06-30")).toHaveLength(0);
  });

  test("detecta un ingreso y un egreso del mismo monto (direcciones distintas)", () => {
    insertMov({ fecha: "2026-06-14", direccion: "in", monto_total: 50000, detalle: "cobro" });
    insertMov({ fecha: "2026-06-16", direccion: "out", monto_total: 50000, detalle: "pago" });
    expect(repo.findReflejos("2026-06-01", "2026-06-30")).toHaveLength(1);
  });

  test("no reporta montos distintos aunque las fechas sean cercanas", () => {
    insertMov({ fecha: "2026-06-14", direccion: "in", monto_total: 85000, detalle: "a" });
    insertMov({ fecha: "2026-06-15", direccion: "in", monto_total: 85001, detalle: "b" });
    expect(repo.findReflejos("2026-06-01", "2026-06-30")).toHaveLength(0);
  });

  test("ordena por score descendente", () => {
    insertMov({
      fecha: "2026-06-10",
      direccion: "in",
      monto_total: 7000,
      detalle: "mercado pago cobro",
    });
    insertMov({
      fecha: "2026-06-11",
      direccion: "in",
      monto_total: 7000,
      detalle: "mercado pago cobro comercio",
    });
    insertMov({ fecha: "2026-06-12", direccion: "in", monto_total: 7000, detalle: "zzzzzzzzz" });
    const pares = repo.findReflejos("2026-06-01", "2026-06-30");
    expect(pares.length).toBeGreaterThan(1);
    for (let i = 1; i < pares.length; i++) {
      const anterior = pares[i - 1];
      const actual = pares[i];
      expect(anterior).toBeDefined();
      expect(actual).toBeDefined();
      expect(anterior?.score).toBeGreaterThanOrEqual(actual?.score ?? 0);
    }
  });

  test("el score acompaña pero no filtra: un par sin texto en común se reporta igual", () => {
    insertMov({ fecha: "2026-06-14", direccion: "in", monto_total: 85000, detalle: "abcdef" });
    insertMov({ fecha: "2026-06-16", direccion: "in", monto_total: 85000, detalle: "xyzwvu" });
    const pares = repo.findReflejos("2026-06-01", "2026-06-30");
    expect(pares).toHaveLength(1);
    expect(pares[0]?.score).toBe(0);
  });
});
