import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
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

export function resolveDbPath(cwd: string = process.cwd()): string {
  if (process.env.DB_PATH) return process.env.DB_PATH;

  const config = loadConfig(cwd);
  if (config.db_path) return expandHome(config.db_path);

  if (process.env.MITARASCA_INSTALLED === "1") {
    const home = process.env.HOME || homedir();
    const xdgDataHome = process.env.XDG_DATA_HOME
      ? expandHome(process.env.XDG_DATA_HOME)
      : join(home, ".local", "share");
    return join(xdgDataHome, "mitarasca", "mitarasca.db");
  }

  return new URL("data/mitarasca.db", REPO_ROOT).pathname;
}

let cachedDb: DbClient | undefined;

export function getDb(): DbClient {
  if (!cachedDb) {
    const dbPath = resolveDbPath();
    mkdirSync(dirname(dbPath), { recursive: true });
    const sqlite = new Database(dbPath);
    cachedDb = drizzle(sqlite, { schema });
  }
  return cachedDb;
}

export function ensureDb(): DbClient {
  const db = getDb();
  bootstrapDb(db);
  const hasTags = db.select().from(tags).limit(1).all().length > 0;
  if (!hasTags) seed(db);
  return db;
}
