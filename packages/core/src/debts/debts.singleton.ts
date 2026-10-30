import { getDb } from "../db/client.js";
import { makeDebtsRepo } from "./debts.repository.js";

type Repo = ReturnType<typeof makeDebtsRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeDebtsRepo(getDb()));

export const createDebt: Repo["createDebt"] = (...args) => getRepo().createDebt(...args);
export const getDebtById: Repo["getDebtById"] = (...args) => getRepo().getDebtById(...args);
export const listDebts: Repo["listDebts"] = (...args) => getRepo().listDebts(...args);
export const updateDebt: Repo["updateDebt"] = (...args) => getRepo().updateDebt(...args);
export const deleteDebt: Repo["deleteDebt"] = (...args) => getRepo().deleteDebt(...args);
export const totalsByMedioPago: Repo["totalsByMedioPago"] = (...args) =>
  getRepo().totalsByMedioPago(...args);
export const totalsByPersonaBidireccional: Repo["totalsByPersonaBidireccional"] = (...args) =>
  getRepo().totalsByPersonaBidireccional(...args);
export const shareDebt: Repo["shareDebt"] = (...args) => getRepo().shareDebt(...args);
export const listDerivedDebts: Repo["listDerivedDebts"] = (...args) =>
  getRepo().listDerivedDebts(...args);
