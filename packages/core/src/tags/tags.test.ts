import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { type TagsRepo, makeTagsRepo } from "./tags.repository.js";
import { validateMovementTags, validateTagsAlcanceForDireccion } from "./tags.validation.js";

let repo: TagsRepo;
let sqlite: Database;

beforeEach(() => {
  sqlite = new Database(":memory:");
  const testDb: DbClient = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  repo = makeTagsRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("Tags CRUD", () => {
  test("crea un tag y lo recupera por id", () => {
    const tag = repo.createTag({ kind: "concepto", nombre: "Prueba", color: "#ff0000" });
    expect(tag.id).toBeGreaterThan(0);
    expect(tag.nombre).toBe("Prueba");
    expect(tag.activo).toBe(true);

    const found = repo.getTagById(tag.id);
    expect(found).toBeDefined();
    expect(found?.nombre).toBe("Prueba");
  });

  test("alcance default es 'general' al crear sin especificarlo", () => {
    const tag = repo.createTag({ kind: "concepto", nombre: "Prueba", color: "#ff0000" });
    expect(tag.alcance).toBe("general");
  });

  test("lista tags por kind", () => {
    repo.createTag({ kind: "tipo", nombre: "Fijo", color: "#111" });
    repo.createTag({ kind: "tipo", nombre: "Variable", color: "#222" });
    repo.createTag({ kind: "estado", nombre: "Pagado", color: "#333" });

    const tipos = repo.listTagsByKind("tipo");
    expect(tipos.length).toBe(2);
    expect(tipos.every((t) => t.kind === "tipo")).toBe(true);
  });

  test("listTagsByKind filtra por opts.soloActivos", () => {
    const activo = repo.createTag({ kind: "concepto", nombre: "Activo", color: "#111" });
    const inactivo = repo.createTag({ kind: "concepto", nombre: "Inactivo", color: "#222" });
    repo.deactivateTag(inactivo.id);

    const todos = repo.listTagsByKind("concepto");
    expect(todos.map((t) => t.id)).toContain(activo.id);
    expect(todos.map((t) => t.id)).toContain(inactivo.id);

    const soloActivos = repo.listTagsByKind("concepto", { soloActivos: true });
    expect(soloActivos.map((t) => t.id)).toContain(activo.id);
    expect(soloActivos.map((t) => t.id)).not.toContain(inactivo.id);
  });

  test("listTagsByKind filtra por opts.alcance (valor único y array)", () => {
    repo.createTag({ kind: "concepto", nombre: "Gas", color: "#111", alcance: "egreso" });
    repo.createTag({ kind: "concepto", nombre: "Facturación", color: "#222", alcance: "ingreso" });
    repo.createTag({ kind: "concepto", nombre: "Varios", color: "#333", alcance: "general" });

    const egreso = repo.listTagsByKind("concepto", { alcance: "egreso" });
    expect(egreso.map((t) => t.nombre)).toEqual(["Gas"]);

    const ingresoOGeneral = repo.listTagsByKind("concepto", { alcance: ["ingreso", "general"] });
    expect(ingresoOGeneral.map((t) => t.nombre).sort()).toEqual(["Facturación", "Varios"]);
  });

  test("listTags filtra por opts.soloActivos", () => {
    const activo = repo.createTag({ kind: "persona", nombre: "Activo", color: "#111" });
    const inactivo = repo.createTag({ kind: "persona", nombre: "Inactivo", color: "#222" });
    repo.deactivateTag(inactivo.id);

    const soloActivos = repo.listTags({ soloActivos: true });
    expect(soloActivos.map((t) => t.id)).toContain(activo.id);
    expect(soloActivos.map((t) => t.id)).not.toContain(inactivo.id);
  });

  test("actualiza nombre y color de un tag", () => {
    const tag = repo.createTag({ kind: "persona", nombre: "Beto", color: "#aaa" });
    const updated = repo.updateTag(tag.id, { nombre: "Beto V2", color: "#bbb" });
    expect(updated.nombre).toBe("Beto V2");
    expect(updated.color).toBe("#bbb");
  });

  test("desactiva un tag", () => {
    const tag = repo.createTag({ kind: "medio_pago", nombre: "Efectivo", color: "#ccc" });
    const deactivated = repo.deactivateTag(tag.id);
    expect(deactivated.activo).toBe(false);
  });
});

describe("Guard de kind=estado", () => {
  test("renombrar un tag de kind=estado falla", () => {
    const tag = repo.createTag({ kind: "estado", nombre: "Pagado", color: "#22c55e" });
    expect(() => repo.updateTag(tag.id, { nombre: "Pagado V2" })).toThrow();
  });

  test("archivar un tag de kind=estado falla", () => {
    const tag = repo.createTag({ kind: "estado", nombre: "Pagado", color: "#22c55e" });
    expect(() => repo.deactivateTag(tag.id)).toThrow();
  });

  test("cambiar solo color/alcance de un tag kind=estado funciona", () => {
    const tag = repo.createTag({ kind: "estado", nombre: "Pagado", color: "#22c55e" });
    const updated = repo.updateTag(tag.id, { color: "#000000", alcance: "ingreso" });
    expect(updated.color).toBe("#000000");
    expect(updated.alcance).toBe("ingreso");
    expect(updated.nombre).toBe("Pagado");
  });

  test("actualizar un tag kind=estado con el mismo nombre no falla", () => {
    const tag = repo.createTag({ kind: "estado", nombre: "Pagado", color: "#22c55e" });
    const updated = repo.updateTag(tag.id, { nombre: "Pagado", color: "#000000" });
    expect(updated.color).toBe("#000000");
  });
});

describe("validateMovementTags", () => {
  test("pasa cuando hay 1 tipo + 1 concepto + 1 estado", () => {
    const result = validateMovementTags([
      { kind: "tipo" },
      { kind: "concepto" },
      { kind: "estado" },
    ]);
    expect(result.ok).toBe(true);
  });

  test("error cuando falta tipo", () => {
    const result = validateMovementTags([{ kind: "concepto" }, { kind: "estado" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "MISSING_TIPO")).toBe(true);
  });

  test("pasa con tipo + estado sin concepto (concepto es 0..N)", () => {
    const result = validateMovementTags([{ kind: "tipo" }, { kind: "estado" }]);
    expect(result.ok).toBe(true);
  });

  test("error cuando falta estado", () => {
    const result = validateMovementTags([{ kind: "tipo" }, { kind: "concepto" }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.code === "MISSING_ESTADO")).toBe(true);
  });

  test("error cuando hay más de 1 estado", () => {
    const result = validateMovementTags([
      { kind: "tipo" },
      { kind: "concepto" },
      { kind: "estado" },
      { kind: "estado" },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      const err = result.errors.find((e) => e.code === "MULTIPLE_ESTADO");
      expect(err).toBeDefined();
      if (err?.code === "MULTIPLE_ESTADO") expect(err.count).toBe(2);
    }
  });

  test("acepta tags extra (medio_pago, persona) además de los obligatorios", () => {
    const result = validateMovementTags([
      { kind: "tipo" },
      { kind: "concepto" },
      { kind: "estado" },
      { kind: "medio_pago" },
      { kind: "persona" },
    ]);
    expect(result.ok).toBe(true);
  });
});

describe("validateTagsAlcanceForDireccion", () => {
  test("ok con alcance='general' en cualquier dirección", () => {
    const result = validateTagsAlcanceForDireccion([{ id: 1, alcance: "general" }], "in");
    expect(result.ok).toBe(true);
    const result2 = validateTagsAlcanceForDireccion([{ id: 1, alcance: "general" }], "out");
    expect(result2.ok).toBe(true);
  });

  test("ok con alcance coincidente con la dirección", () => {
    const ingreso = validateTagsAlcanceForDireccion([{ id: 1, alcance: "ingreso" }], "in");
    expect(ingreso.ok).toBe(true);
    const egreso = validateTagsAlcanceForDireccion([{ id: 2, alcance: "egreso" }], "out");
    expect(egreso.ok).toBe(true);
  });

  test("error con alcance opuesto a la dirección", () => {
    const result = validateTagsAlcanceForDireccion([{ id: 1, alcance: "egreso" }], "in");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        { code: "ALCANCE_INCOMPATIBLE", tagId: 1, alcance: "egreso" },
      ]);
    }
  });
});
