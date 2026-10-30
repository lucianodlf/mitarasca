// Crea (o actualiza) la DB que resuelve resolveDbPath(): migraciones + seed base si está vacía.
// Uso: bun run db:init   (desde la raíz)
import { ensureDb, resolveDbPath } from "../src/index.js";

ensureDb();
console.log(`DB lista: ${resolveDbPath()}`);
