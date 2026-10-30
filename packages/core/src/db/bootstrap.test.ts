import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { bootstrapDb } from "./bootstrap.js";
import type { DbClient } from "./client.js";
import * as schema from "./schema.js";
import { proration_presets, tags } from "./schema.js";
import { seed } from "./seed.js";

let sqlite: Database;
let testDb: DbClient;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
});

afterEach(() => {
  sqlite.close();
});

describe("bootstrapDb", () => {
  test("corre las migraciones y deja las tablas creadas", () => {
    bootstrapDb(testDb, "./drizzle");
    const row = testDb.select().from(tags).all();
    expect(row).toEqual([]);
  });

  test("es idempotente: correrla dos veces no falla", () => {
    bootstrapDb(testDb, "./drizzle");
    expect(() => bootstrapDb(testDb, "./drizzle")).not.toThrow();
  });
});

describe("seed", () => {
  beforeEach(() => {
    bootstrapDb(testDb, "./drizzle");
  });

  test("inserta los 17 tags y 1 preset", () => {
    seed(testDb);
    expect(testDb.select().from(tags).all().length).toBe(17);
    expect(testDb.select().from(proration_presets).all().length).toBe(1);
  });

  test("es idempotente: correrlo dos veces no duplica filas", () => {
    seed(testDb);
    seed(testDb);
    expect(testDb.select().from(tags).all().length).toBe(17);
    expect(testDb.select().from(proration_presets).all().length).toBe(1);
  });
});
