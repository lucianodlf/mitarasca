import { getDb } from "../db/client.js";
import { makeReportRepo } from "./report.repository.js";

type Repo = ReturnType<typeof makeReportRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeReportRepo(getDb()));

export const buildFinancialReport: Repo["buildFinancialReport"] = (...args) =>
  getRepo().buildFinancialReport(...args);
