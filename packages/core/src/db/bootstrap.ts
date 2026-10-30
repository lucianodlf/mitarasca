import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "./client.js";

const DEFAULT_MIGRATIONS_FOLDER =
  process.env.MITARASCA_INSTALLED === "1"
    ? new URL("drizzle", import.meta.url).pathname
    : new URL("../../drizzle", import.meta.url).pathname;

export function bootstrapDb(db: DbClient, migrationsFolder?: string): void {
  migrate(db, { migrationsFolder: migrationsFolder ?? DEFAULT_MIGRATIONS_FOLDER });
}
