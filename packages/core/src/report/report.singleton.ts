import { getDb } from "../db/client.js";
import { makeReportRepo } from "./report.repository.js";

type Repo = ReturnType<typeof makeReportRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => {
  if (!repo) repo = makeReportRepo(getDb());
  return repo;
};

export const buildFinancialReport: Repo["buildFinancialReport"] = (...args) =>
  getRepo().buildFinancialReport(...args);
