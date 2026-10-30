import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import { hashFile, partitionImages } from "./hash.js";

let sqlite: Database;
let testDb: DbClient;
let dir: string;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  dir = mkdtempSync(join(tmpdir(), "mitarasca-img-"));
});

afterEach(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function writeImage(nombre: string, contenido: string): string {
  const path = join(dir, nombre);
  writeFileSync(path, contenido);
  return path;
}

describe("hashFile", () => {
  test("el mismo contenido produce el mismo hash", async () => {
    const a = writeImage("a.png", "contenido-identico");
    const b = writeImage("b.png", "contenido-identico");
    expect(await hashFile(a)).toBe(await hashFile(b));
  });

  test("contenidos distintos producen hashes distintos", async () => {
    const a = writeImage("a.png", "uno");
    const b = writeImage("b.png", "dos");
    expect(await hashFile(a)).not.toBe(await hashFile(b));
  });

  test("devuelve hex de 64 caracteres (SHA-256)", async () => {
    const a = writeImage("a.png", "x");
    expect(await hashFile(a)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("partitionImages", () => {
  test("sin movimientos previos, todas las imágenes son nuevas", async () => {
    const a = writeImage("a.png", "uno");
    const b = writeImage("b.png", "dos");
    const { nuevas, salteadas } = await partitionImages(testDb, [a, b]);
    expect(nuevas).toHaveLength(2);
    expect(salteadas).toHaveLength(0);
  });

  test("una imagen cuyo hash ya está en la DB se saltea", async () => {
    const a = writeImage("a.png", "ya-procesada");
    const b = writeImage("b.png", "nueva");
    const hashA = await hashFile(a);

    testDb
      .insert(schema.movements)
      .values({
        fecha: "2026-06-14",
        direccion: "out",
        monto_total: 100,
        monto_efectivo: 100,
        detalle: "previo",
        imported_at: "2026-06-14T10:00:00.000Z",
        source_image_hash: hashA,
      })
      .run();

    const { nuevas, salteadas } = await partitionImages(testDb, [a, b]);
    expect(salteadas.map((i) => i.nombre)).toEqual(["a.png"]);
    expect(nuevas.map((i) => i.nombre)).toEqual(["b.png"]);
  });

  test("los movimientos manuales (hash null) no saltean nada", async () => {
    const a = writeImage("a.png", "uno");
    testDb
      .insert(schema.movements)
      .values({
        fecha: "2026-06-14",
        direccion: "out",
        monto_total: 100,
        monto_efectivo: 100,
        detalle: "manual",
      })
      .run();

    const { nuevas, salteadas } = await partitionImages(testDb, [a]);
    expect(nuevas).toHaveLength(1);
    expect(salteadas).toHaveLength(0);
  });

  test("dos copias del mismo archivo con nombres distintos: la segunda se saltea", async () => {
    const a = writeImage("captura-1.png", "mismo-contenido");
    const b = writeImage("captura-2.png", "mismo-contenido");
    const { nuevas, salteadas } = await partitionImages(testDb, [a, b]);
    expect(nuevas).toHaveLength(1);
    expect(salteadas).toHaveLength(1);
  });
});
