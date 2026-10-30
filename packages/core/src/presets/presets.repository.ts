import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { type NewProrationPreset, type ProrationPreset, proration_presets } from "../db/schema.js";

export interface PresetsRepo {
  createPreset(data: NewProrationPreset): ProrationPreset;
  getPresetById(id: number): ProrationPreset | undefined;
  listPresets(onlyActive?: boolean): ProrationPreset[];
  updatePreset(id: number, data: Partial<Omit<NewProrationPreset, "id">>): ProrationPreset;
  deletePreset(id: number): void;
}

export function makePresetsRepo(db: DbClient): PresetsRepo {
  return {
    createPreset(data: NewProrationPreset): ProrationPreset {
      if (data.factor <= 0) {
        throw new Error("factor debe ser > 0");
      }
      const rows = db.insert(proration_presets).values(data).returning().all();
      const row = rows[0];
      if (!row) throw new Error("No se pudo crear el preset");
      return row;
    },

    getPresetById(id: number): ProrationPreset | undefined {
      return db.select().from(proration_presets).where(eq(proration_presets.id, id)).get();
    },

    listPresets(onlyActive = true): ProrationPreset[] {
      if (onlyActive) {
        return db.select().from(proration_presets).where(eq(proration_presets.activo, true)).all();
      }
      return db.select().from(proration_presets).all();
    },

    updatePreset(id: number, data: Partial<Omit<NewProrationPreset, "id">>): ProrationPreset {
      if (data.factor !== undefined && data.factor <= 0) {
        throw new Error("factor debe ser > 0");
      }
      const rows = db
        .update(proration_presets)
        .set(data)
        .where(eq(proration_presets.id, id))
        .returning()
        .all();
      const row = rows[0];
      if (!row) throw new Error(`Preset ${id} no encontrado`);
      return row;
    },

    deletePreset(id: number): void {
      db.delete(proration_presets).where(eq(proration_presets.id, id)).run();
    },
  };
}
