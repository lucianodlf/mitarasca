import { getDb } from "../db/client.js";
import { makeMovementsRepo } from "./movements.repository.js";

type Repo = ReturnType<typeof makeMovementsRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => {
  if (!repo) repo = makeMovementsRepo(getDb());
  return repo;
};

export const createMovement: Repo["createMovement"] = (...args) =>
  getRepo().createMovement(...args);
export const getMovementById: Repo["getMovementById"] = (...args) =>
  getRepo().getMovementById(...args);
export const getLastMovement: Repo["getLastMovement"] = (...args) =>
  getRepo().getLastMovement(...args);
export const listMovementsByDateRange: Repo["listMovementsByDateRange"] = (...args) =>
  getRepo().listMovementsByDateRange(...args);
export const listMovementsByDirection: Repo["listMovementsByDirection"] = (...args) =>
  getRepo().listMovementsByDirection(...args);
export const listMovementsByTag: Repo["listMovementsByTag"] = (...args) =>
  getRepo().listMovementsByTag(...args);
export const updateMovement: Repo["updateMovement"] = (...args) =>
  getRepo().updateMovement(...args);
export const deleteMovement: Repo["deleteMovement"] = (...args) =>
  getRepo().deleteMovement(...args);
export const summarizeByMonth: Repo["summarizeByMonth"] = (...args) =>
  getRepo().summarizeByMonth(...args);
