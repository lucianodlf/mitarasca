import { getDb } from "../db/client.js";
import { makeBalanceRepo } from "./balance.repository.js";

type Repo = ReturnType<typeof makeBalanceRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeBalanceRepo(getDb()));

export const summarizeByYear: Repo["summarizeByYear"] = (...args) =>
  getRepo().summarizeByYear(...args);
export const estimateVariableExpenses: Repo["estimateVariableExpenses"] = (...args) =>
  getRepo().estimateVariableExpenses(...args);
export const getYearBalanceWithEstimate: Repo["getYearBalanceWithEstimate"] = (...args) =>
  getRepo().getYearBalanceWithEstimate(...args);
