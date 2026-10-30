import { getDb } from "../db/client.js";
import { makeInvisiblesRepo } from "./invisibles.repository.js";

type Repo = ReturnType<typeof makeInvisiblesRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeInvisiblesRepo(getDb()));

export const listInvisibleRules: Repo["listRules"] = (...args) => getRepo().listRules(...args);
export const createInvisibleRule: Repo["createRule"] = (...args) => getRepo().createRule(...args);
export const deleteInvisibleRule: Repo["deleteRule"] = (...args) => getRepo().deleteRule(...args);
export const partitionInvisibleCandidates: Repo["partitionCandidates"] = (...args) =>
  getRepo().partitionCandidates(...args);
