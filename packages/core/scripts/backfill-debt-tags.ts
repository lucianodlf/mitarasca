// Agrega a los movimientos de cuotas existentes los tags de su deuda (issue-022).
// Uso: cd packages/core && bun run scripts/backfill-debt-tags.ts [--apply]
// Sin --apply solo reporta. Hacer backup de la DB antes de aplicar. Idempotente.
import { backfillDebtTags } from "../src/debts/backfill-debt-tags.js";
import { getDb, resolveDbPath } from "../src/index.js";

const apply = process.argv.includes("--apply");
const result = backfillDebtTags(getDb(), { apply });
console.log(
  `${apply ? "Aplicado" : "Dry-run"} sobre ${resolveDbPath()}: ${result.tags} tags en ${result.movements} movimientos`
);
