import { getDb } from "../db/client.js";
import { makeTemplatesRepo } from "./templates.repository.js";

type Repo = ReturnType<typeof makeTemplatesRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeTemplatesRepo(getDb()));

export const generateMonthFromPrevious: Repo["generateMonthFromPrevious"] = (...args) =>
  getRepo().generateMonthFromPrevious(...args);
