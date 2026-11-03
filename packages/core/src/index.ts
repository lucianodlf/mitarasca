export {
  assertDbExists,
  DbNotFoundError,
  ensureDb,
  getDb,
  isDemoMode,
  resolveDbPath,
  resolveDemoDbPath,
} from "./db/client.js";
export type { DbClient } from "./db/client.js";
export * from "./db/schema.js";
export * from "./db/seed.js";
export * from "./db/bootstrap.js";
export * from "./config.js";
export * from "./tags/tags.repository.js";
export * from "./tags/tags.singleton.js";
export * from "./tags/tags.validation.js";
export * from "./movements/movements.repository.js";
export * from "./movements/movements.singleton.js";
export * from "./invisibles/invisibles.repository.js";
export * from "./invisibles/invisibles.singleton.js";
export * from "./dedup/text-similarity.js";
export * from "./dedup/dedup.repository.js";
export * from "./dedup/dedup.singleton.js";
export * from "./images/hash.js";
export * from "./presets/presets.repository.js";
export * from "./templates/templates.repository.js";
export * from "./templates/templates.singleton.js";
export * from "./balance/balance.repository.js";
export * from "./balance/balance.singleton.js";
export * from "./report/report.repository.js";
export * from "./report/report.singleton.js";
export * from "./debts/debts.repository.js";
export * from "./debts/debts.singleton.js";
export * from "./debts/debts.validation.js";
export * from "./debts/installments.repository.js";
export * from "./debts/installments.singleton.js";
