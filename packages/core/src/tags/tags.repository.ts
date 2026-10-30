import { and, eq, inArray } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { type NewTag, type Tag, type TagAlcance, type TagKind, tags } from "../db/schema.js";

export interface TagsRepo {
  createTag(data: NewTag): Tag;
  getTagById(id: number): Tag | undefined;
  listTags(opts?: { soloActivos?: boolean }): Tag[];
  listTagsByKind(
    kind: TagKind,
    opts?: { soloActivos?: boolean; alcance?: TagAlcance | TagAlcance[] }
  ): Tag[];
  updateTag(id: number, data: Partial<Omit<NewTag, "id">>): Tag;
  deactivateTag(id: number): Tag;
}

export function makeTagsRepo(db: DbClient): TagsRepo {
  return {
    createTag(data: NewTag): Tag {
      const rows = db.insert(tags).values(data).returning().all();
      const row = rows[0];
      if (!row) throw new Error("No se pudo crear el tag");
      return row;
    },

    getTagById(id: number): Tag | undefined {
      return db.select().from(tags).where(eq(tags.id, id)).get();
    },

    listTags(opts?: { soloActivos?: boolean }): Tag[] {
      if (opts?.soloActivos) {
        return db.select().from(tags).where(eq(tags.activo, true)).all();
      }
      return db.select().from(tags).all();
    },

    listTagsByKind(
      kind: TagKind,
      opts?: { soloActivos?: boolean; alcance?: TagAlcance | TagAlcance[] }
    ): Tag[] {
      const conditions = [eq(tags.kind, kind)];
      if (opts?.soloActivos) conditions.push(eq(tags.activo, true));
      if (opts?.alcance !== undefined) {
        const alcances = Array.isArray(opts.alcance) ? opts.alcance : [opts.alcance];
        conditions.push(inArray(tags.alcance, alcances));
      }
      return db
        .select()
        .from(tags)
        .where(and(...conditions))
        .all();
    },

    updateTag(id: number, data: Partial<Omit<NewTag, "id">>): Tag {
      const current = db.select().from(tags).where(eq(tags.id, id)).get();
      if (!current) throw new Error(`Tag ${id} no encontrado`);
      if (current.kind === "estado") {
        if (data.nombre !== undefined && data.nombre !== current.nombre) {
          throw new Error("No se puede renombrar un tag de kind=estado");
        }
        if (data.activo === false) {
          throw new Error("No se puede archivar un tag de kind=estado");
        }
      }

      const rows = db.update(tags).set(data).where(eq(tags.id, id)).returning().all();
      const row = rows[0];
      if (!row) throw new Error(`Tag ${id} no encontrado`);
      return row;
    },

    deactivateTag(id: number): Tag {
      return this.updateTag(id, { activo: false });
    },
  };
}
