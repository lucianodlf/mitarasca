import { getDb } from "../db/client.js";
import { makeInstallmentsRepo } from "./installments.repository.js";

type Repo = ReturnType<typeof makeInstallmentsRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => {
  if (!repo) repo = makeInstallmentsRepo(getDb());
  return repo;
};

export const listInstallmentsByDebt: Repo["listInstallmentsByDebt"] = (...args) =>
  getRepo().listInstallmentsByDebt(...args);
export const getInstallmentById: Repo["getInstallmentById"] = (...args) =>
  getRepo().getInstallmentById(...args);
export const updateInstallment: Repo["updateInstallment"] = (...args) =>
  getRepo().updateInstallment(...args);
export const payInstallment: Repo["payInstallment"] = (...args) =>
  getRepo().payInstallment(...args);
export const toggleInstallmentEstado: Repo["toggleInstallmentEstado"] = (...args) =>
  getRepo().toggleInstallmentEstado(...args);
export const syncInstallmentFromMovement: Repo["syncInstallmentFromMovement"] = (...args) =>
  getRepo().syncInstallmentFromMovement(...args);
export const projectInstallmentsByMonth: Repo["projectInstallmentsByMonth"] = (...args) =>
  getRepo().projectInstallmentsByMonth(...args);
