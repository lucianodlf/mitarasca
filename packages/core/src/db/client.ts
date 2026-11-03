import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { expandHome, loadConfig } from "../config.js";
import { bootstrapDb } from "./bootstrap.js";
import * as schema from "./schema.js";
import { tags } from "./schema.js";
import { seed } from "./seed.js";

export type DbClient = BunSQLiteDatabase<typeof schema>;

const REPO_ROOT = new URL("../../../../", import.meta.url);

function xdgDataDir(): string {
  const home = process.env.HOME || homedir();
  const base = process.env.XDG_DATA_HOME
    ? expandHome(process.env.XDG_DATA_HOME)
    : join(home, ".local", "share");
  return join(base, "mitarasca");
}

export function isDemoMode(): boolean {
  return process.env.MITARASCA_DEMO === "1";
}

/** DB de demo: junto a la default (`<repo>/data/` en el clon, XDG en modo instalado). */
export function resolveDemoDbPath(): string {
  if (process.env.MITARASCA_INSTALLED === "1") return join(xdgDataDir(), "demo.db");
  return new URL("data/demo.db", REPO_ROOT).pathname;
}

/** Precedencia: DB_PATH > MITARASCA_DEMO=1 > db_path del config > XDG (instalado) > <repo>/data. */
export function resolveDbPath(cwd: string = process.cwd()): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  if (isDemoMode()) return resolveDemoDbPath();

  const config = loadConfig(cwd);
  if (config.db_path) return expandHome(config.db_path);

  if (process.env.MITARASCA_INSTALLED === "1") return join(xdgDataDir(), "mitarasca.db");

  return new URL("data/mitarasca.db", REPO_ROOT).pathname;
}

export class DbNotFoundError extends Error {
  constructor(readonly path: string) {
    super(
      `No hay base de datos en ${path}. Corré \`${isDemoMode() ? "mitarasca demo" : "mitarasca init"}\` para crearla.`
    );
    this.name = "DbNotFoundError";
  }
}

/** Lanza DbNotFoundError si la DB resuelta no existe; no crea nada. Devuelve la ruta. */
export function assertDbExists(dbPath: string = resolveDbPath()): string {
  if (dbPath !== ":memory:" && !existsSync(dbPath)) throw new DbNotFoundError(dbPath);
  return dbPath;
}

let cachedDb: DbClient | undefined;

export function getDb(): DbClient {
  if (!cachedDb) {
    const sqlite = new Database(assertDbExists());
    cachedDb = drizzle(sqlite, { schema });
  }
  return cachedDb;
}

/** Único punto que crea la DB: migra y siembra la base si está vacía. */
export function ensureDb(): DbClient {
  if (!cachedDb) {
    const dbPath = resolveDbPath();
    if (dbPath !== ":memory:") mkdirSync(dirname(dbPath), { recursive: true });
    cachedDb = drizzle(new Database(dbPath), { schema });
  }
  const db = cachedDb;
  bootstrapDb(db);
  const hasTags = db.select().from(tags).limit(1).all().length > 0;
  if (!hasTags) seed(db);
  return db;
}
