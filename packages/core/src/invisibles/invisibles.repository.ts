import { eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  type InvisibleRule,
  type MovementDirection,
  type NewInvisibleRule,
  invisible_rules,
} from "../db/schema.js";
import { normalizeDetalle } from "../dedup/text-similarity.js";

/** Lo mínimo que necesita un candidato para ser evaluado contra las reglas. */
export type InvisibleCandidate = { direccion: MovementDirection; detalle: string };

export type InvisibleMatch<T> = { candidato: T; regla: InvisibleRule };

export interface InvisiblesRepo {
  listRules(soloActivas?: boolean): InvisibleRule[];
  createRule(data: NewInvisibleRule): InvisibleRule;
  deleteRule(id: number): void;
  partitionCandidates<T extends InvisibleCandidate>(
    candidatos: T[]
  ): { visibles: T[]; invisibles: InvisibleMatch<T>[] };
}

function matches(regla: InvisibleRule, candidato: InvisibleCandidate): boolean {
  // direccion null en la regla = aplica a ingresos y egresos.
  if (regla.direccion !== null && regla.direccion !== candidato.direccion) return false;

  // Se normalizan ambos lados con la misma función que usa el nivel 1, para que
  // las dos reglas de matcheo no diverjan con el tiempo.
  const detalle = normalizeDetalle(candidato.detalle);
  const patron = normalizeDetalle(regla.patron);

  return regla.modo === "contiene" ? detalle.includes(patron) : detalle === patron;
}

export function makeInvisiblesRepo(db: DbClient): InvisiblesRepo {
  return {
    listRules(soloActivas = false): InvisibleRule[] {
      const base = db.select().from(invisible_rules);
      return soloActivas ? base.where(eq(invisible_rules.activa, true)).all() : base.all();
    },

    createRule(data: NewInvisibleRule): InvisibleRule {
      const row = db.insert(invisible_rules).values(data).returning().all()[0];
      if (!row) throw new Error("No se pudo crear la regla invisible");
      return row;
    },

    deleteRule(id: number): void {
      db.delete(invisible_rules).where(eq(invisible_rules.id, id)).run();
    },

    partitionCandidates<T extends InvisibleCandidate>(candidatos: T[]) {
      const reglas = this.listRules(true);
      const visibles: T[] = [];
      const invisibles: InvisibleMatch<T>[] = [];

      for (const candidato of candidatos) {
        const regla = reglas.find((r) => matches(r, candidato));
        if (regla) invisibles.push({ candidato, regla });
        else visibles.push(candidato);
      }

      return { visibles, invisibles };
    },
  };
}
