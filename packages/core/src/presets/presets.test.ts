import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { type PresetsRepo, makePresetsRepo } from "./presets.repository.js";

let repo: PresetsRepo;
let sqlite: Database;

beforeEach(() => {
  sqlite = new Database(":memory:");
  const testDb: DbClient = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  repo = makePresetsRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("Proration Presets CRUD", () => {
  test("crea y recupera un preset", () => {
    const preset = repo.createPreset({ nombre: "Compartido /2", op: "div", factor: 2 });
    expect(preset.nombre).toBe("Compartido /2");
    expect(preset.op).toBe("div");
    expect(preset.factor).toBe(2);
    expect(preset.activo).toBe(true);

    const found = repo.getPresetById(preset.id);
    expect(found).toEqual(preset);
  });

  test("lista solo activos por defecto", () => {
    repo.createPreset({ nombre: "A", op: "div", factor: 2 });
    repo.createPreset({ nombre: "B", op: "mul", factor: 3, activo: false });

    const active = repo.listPresets();
    expect(active).toHaveLength(1);
    expect(active[0]?.nombre).toBe("A");

    const all = repo.listPresets(false);
    expect(all).toHaveLength(2);
  });

  test("actualiza un preset", () => {
    const preset = repo.createPreset({ nombre: "Test", op: "div", factor: 2 });
    const updated = repo.updatePreset(preset.id, { factor: 3, nombre: "Test v2" });
    expect(updated.factor).toBe(3);
    expect(updated.nombre).toBe("Test v2");
  });

  test("elimina un preset", () => {
    const preset = repo.createPreset({ nombre: "Delete me", op: "mul", factor: 5 });
    repo.deletePreset(preset.id);
    expect(repo.getPresetById(preset.id)).toBeUndefined();
  });

  test("rechaza factor <= 0 en create", () => {
    expect(() => repo.createPreset({ nombre: "Bad", op: "div", factor: 0 })).toThrow(
      "factor debe ser > 0"
    );
    expect(() => repo.createPreset({ nombre: "Bad", op: "div", factor: -1 })).toThrow(
      "factor debe ser > 0"
    );
  });

  test("rechaza factor <= 0 en update", () => {
    const preset = repo.createPreset({ nombre: "Valid", op: "div", factor: 2 });
    expect(() => repo.updatePreset(preset.id, { factor: 0 })).toThrow("factor debe ser > 0");
  });

  test("nombre unique constraint", () => {
    repo.createPreset({ nombre: "Unico", op: "div", factor: 2 });
    expect(() => repo.createPreset({ nombre: "Unico", op: "mul", factor: 3 })).toThrow();
  });
});
