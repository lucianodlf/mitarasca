import { and, eq } from "drizzle-orm";
import type { DbClient } from "./client.js";
import { type NewProrationPreset, type NewTag, proration_presets, tags } from "./schema.js";

const SEED_TAGS: NewTag[] = [
  // tipo
  { kind: "tipo", nombre: "Fijo", color: "#6366f1" },
  { kind: "tipo", nombre: "Variable", color: "#f59e0b" },
  // estado
  { kind: "estado", nombre: "Pagado", color: "#22c55e" },
  { kind: "estado", nombre: "Adeudado", color: "#ef4444" },
  // concepto
  { kind: "concepto", nombre: "Gas", color: "#f97316" },
  { kind: "concepto", nombre: "Agua", color: "#38bdf8" },
  { kind: "concepto", nombre: "Luz", color: "#facc15" },
  { kind: "concepto", nombre: "Internet/Celular", color: "#818cf8" },
  { kind: "concepto", nombre: "Alquiler", color: "#a78bfa" },
  { kind: "concepto", nombre: "Terapia", color: "#f472b6" },
  { kind: "concepto", nombre: "Monot+Impuestos", color: "#fb923c" },
  { kind: "concepto", nombre: "Obra Social", color: "#34d399" },
  { kind: "concepto", nombre: "Super", color: "#4ade80" },
  { kind: "concepto", nombre: "Hogar/Autocuidado", color: "#a3e635" },
  { kind: "concepto", nombre: "Gustos/Salidas", color: "#f43f5e" },
  { kind: "concepto", nombre: "Comida/Bebida", color: "#fb7185" },
  { kind: "concepto", nombre: "Varios", color: "#94a3b8" },
];

const SEED_PRESETS: NewProrationPreset[] = [{ nombre: "Compartido /2", op: "div", factor: 2 }];

export function seed(db: DbClient): void {
  for (const tag of SEED_TAGS) {
    const existing = db
      .select()
      .from(tags)
      .where(and(eq(tags.kind, tag.kind), eq(tags.nombre, tag.nombre)))
      .get();
    if (!existing) {
      db.insert(tags).values(tag).run();
    }
  }

  for (const preset of SEED_PRESETS) {
    const existing = db
      .select()
      .from(proration_presets)
      .where(eq(proration_presets.nombre, preset.nombre))
      .get();
    if (!existing) {
      db.insert(proration_presets).values(preset).run();
    }
  }
}
