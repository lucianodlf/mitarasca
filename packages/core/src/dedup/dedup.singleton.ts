import { getDb } from "../db/client.js";
import { makeDedupRepo } from "./dedup.repository.js";

type Repo = ReturnType<typeof makeDedupRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeDedupRepo(getDb()));

export const identityKey: Repo["identityKey"] = (...args) => getRepo().identityKey(...args);
export const findExactInDb: Repo["findExactInDb"] = (...args) => getRepo().findExactInDb(...args);
export const findExactPairs: Repo["findExactPairs"] = (...args) =>
  getRepo().findExactPairs(...args);
export const findReflejos: Repo["findReflejos"] = (...args) => getRepo().findReflejos(...args);
export const recordFinding: Repo["recordFinding"] = (...args) => getRepo().recordFinding(...args);
export const listFindings: Repo["listFindings"] = (...args) => getRepo().listFindings(...args);
export const updateFindingEstado: Repo["updateFindingEstado"] = (...args) =>
  getRepo().updateFindingEstado(...args);
