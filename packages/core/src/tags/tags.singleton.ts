import { getDb } from "../db/client.js";
import { makeTagsRepo } from "./tags.repository.js";

type Repo = ReturnType<typeof makeTagsRepo>;
let repo: Repo | undefined;
const getRepo = (): Repo => (repo ??= makeTagsRepo(getDb()));

export const createTag: Repo["createTag"] = (...args) => getRepo().createTag(...args);
export const getTagById: Repo["getTagById"] = (...args) => getRepo().getTagById(...args);
export const listTags: Repo["listTags"] = (...args) => getRepo().listTags(...args);
export const listTagsByKind: Repo["listTagsByKind"] = (...args) =>
  getRepo().listTagsByKind(...args);
export const updateTag: Repo["updateTag"] = (...args) => getRepo().updateTag(...args);
export const deactivateTag: Repo["deactivateTag"] = (...args) => getRepo().deactivateTag(...args);
