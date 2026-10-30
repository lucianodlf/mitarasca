import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { type InvisiblesRepo, makeInvisiblesRepo } from "./invisibles.repository.js";

let sqlite: Database;
let testDb: DbClient;
let repo: InvisiblesRepo;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  repo = makeInvisiblesRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("CRUD de reglas", () => {
  test("crea y lista una regla", () => {
    repo.createRule({ direccion: "in", patron: "Delfino, Luciano", modo: "contiene" });
    const reglas = repo.listRules();
    expect(reglas).toHaveLength(1);
    expect(reglas[0]?.patron).toBe("Delfino, Luciano");
    expect(reglas[0]?.activa).toBe(true);
  });

  test("listRules(true) omite las inactivas", () => {
    repo.createRule({ patron: "activa", modo: "exacto" });
    repo.createRule({ patron: "inactiva", modo: "exacto", activa: false });
    expect(repo.listRules(true).map((r) => r.patron)).toEqual(["activa"]);
    expect(repo.listRules()).toHaveLength(2);
  });

  test("elimina una regla", () => {
    const r = repo.createRule({ patron: "temporal", modo: "exacto" });
    repo.deleteRule(r.id);
    expect(repo.listRules()).toHaveLength(0);
  });
});

describe("partitionCandidates", () => {
  test("sin reglas, todos los candidatos son visibles", () => {
    const { visibles, invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Sueldo" },
    ]);
    expect(visibles).toHaveLength(1);
    expect(invisibles).toHaveLength(0);
  });

  test("modo contiene matchea una subcadena", () => {
    repo.createRule({ direccion: "in", patron: "Delfino, Luciano", modo: "contiene" });
    const { visibles, invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Delfino, Luciano Ja" },
      { direccion: "in" as const, detalle: "Sueldo" },
    ]);
    expect(invisibles.map((i) => i.candidato.detalle)).toEqual(["Delfino, Luciano Ja"]);
    expect(visibles.map((v) => v.detalle)).toEqual(["Sueldo"]);
  });

  test("el matcheo normaliza mayúsculas y espacios de ambos lados", () => {
    repo.createRule({ direccion: "in", patron: "Delfino,  LUCIANO", modo: "contiene" });
    const { invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "DELFINO,   luciano Jav" },
    ]);
    expect(invisibles).toHaveLength(1);
  });

  test("modo exacto no matchea una variante más larga", () => {
    repo.createRule({ direccion: "in", patron: "Delfino, Luciano", modo: "exacto" });
    const { visibles, invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Delfino, Luciano Ja" },
      { direccion: "in" as const, detalle: "Delfino, Luciano" },
    ]);
    expect(invisibles).toHaveLength(1);
    expect(invisibles[0]?.candidato.detalle).toBe("Delfino, Luciano");
    expect(visibles).toHaveLength(1);
  });

  test("la dirección de la regla acota el matcheo", () => {
    repo.createRule({ direccion: "in", patron: "transferencia", modo: "contiene" });
    const { visibles, invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Transferencia recibida" },
      { direccion: "out" as const, detalle: "Transferencia enviada" },
    ]);
    expect(invisibles).toHaveLength(1);
    expect(visibles.map((v) => v.direccion)).toEqual(["out"]);
  });

  test("una regla sin dirección aplica a ambas", () => {
    repo.createRule({ patron: "ajuste interno", modo: "contiene" });
    const { invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Ajuste interno A" },
      { direccion: "out" as const, detalle: "Ajuste interno B" },
    ]);
    expect(invisibles).toHaveLength(2);
  });

  test("las reglas inactivas no filtran", () => {
    repo.createRule({ direccion: "in", patron: "Delfino", modo: "contiene", activa: false });
    const { visibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Delfino, Luciano Ja" },
    ]);
    expect(visibles).toHaveLength(1);
  });

  test("informa qué regla causó cada exclusión", () => {
    const regla = repo.createRule({ direccion: "in", patron: "Delfino", modo: "contiene" });
    const { invisibles } = repo.partitionCandidates([
      { direccion: "in" as const, detalle: "Delfino, Luciano Ja" },
    ]);
    expect(invisibles[0]?.regla.id).toBe(regla.id);
  });
});
