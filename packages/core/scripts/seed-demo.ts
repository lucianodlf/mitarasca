// Regenera la DB de demo (ver src/db/seed-demo.ts).
// Uso: bun packages/core/scripts/seed-demo.ts [ruta-salida]   (default: <repo>/data/demo.db)
import { seedDemoDb } from "../src/db/seed-demo.js";

const out = process.argv[2] ?? new URL("../../../data/demo.db", import.meta.url).pathname;
try {
  seedDemoDb(out);
  console.log(`demo generada: ${out}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
