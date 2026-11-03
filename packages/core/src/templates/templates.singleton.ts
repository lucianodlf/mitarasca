import { getDb } from "../db/client.js";
import { makeTemplatesRepo } from "./templates.repository.js";

type Repo = ReturnType<typeof makeTemplatesRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => {
  if (!repo) repo = makeTemplatesRepo(getDb());
  return repo;
};

export const generateMonthFromPrevious: Repo["generateMonthFromPrevious"] = (...args) =>
  getRepo().generateMonthFromPrevious(...args);
