import type { Config } from "drizzle-kit";

// drizzle-kit corre con cwd packages/core: el default apunta a <raíz>/data, igual que resolveDbPath().
const dbPath = process.env.DB_PATH ?? "../../data/mitarasca.db";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: dbPath,
  },
} satisfies Config;
