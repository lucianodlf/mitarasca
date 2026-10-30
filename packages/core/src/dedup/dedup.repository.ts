import { and, eq, gte, isNull, lte, or } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  type DuplicateFinding,
  type DuplicateNivel,
  type FindingEstado,
  type Movement,
  type MovementDirection,
  type ReglaOp,
  duplicate_findings,
  movements,
} from "../db/schema.js";
import { diceCoefficient, normalizeDetalle } from "./text-similarity.js";

/** Un movimiento potencial, todavía no necesariamente en la DB. */
export type MovementCandidate = {
  fecha: string;
  direccion: MovementDirection;
  monto_total: number;
  detalle: string;
  regla_op?: ReglaOp;
  regla_factor?: number | null;
  source_image_hash?: string | null;
};

export type FindingInput = {
  nivel: DuplicateNivel;
  movement_a_id: number;
  movement_b_id?: number | null;
  candidato_json?: string | null;
  motivo: string;
  score?: number | null;
};

export type RecordedFinding = DuplicateFinding & { nuevo: boolean };

export type ReflejoPair = { a: Movement; b: Movement; diasDiff: number; score: number };

export interface DedupRepo {
  identityKey(m: MovementCandidate): string;
  findExactInDb(candidato: MovementCandidate): Movement[];
  findExactPairs(from: string, to: string): { a: Movement; b: Movement }[];
  findReflejos(from: string, to: string, opts?: { ventanaDias?: number }): ReflejoPair[];
  recordFinding(input: FindingInput): RecordedFinding;
  listFindings(filtro?: { estado?: FindingEstado }): DuplicateFinding[];
  updateFindingEstado(id: number, estado: FindingEstado): DuplicateFinding;
}

/**
 * Clave de identidad de un movimiento. Usa `monto_total` + la regla de
 * prorrateo, nunca `monto_efectivo`: 10000 sin regla y 20000 ÷2 dan el mismo
 * efectivo pero son movimientos distintos.
 */
function buildIdentityKey(m: MovementCandidate): string {
  return [
    m.fecha,
    m.direccion,
    normalizeDetalle(m.detalle),
    m.monto_total,
    m.regla_op ?? "none",
    m.regla_factor ?? "",
  ].join("|");
}

const MS_POR_DIA = 86_400_000;

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / MS_POR_DIA;
}

export function makeDedupRepo(db: DbClient): DedupRepo {
  return {
    identityKey: buildIdentityKey,

    findExactInDb(candidato: MovementCandidate): Movement[] {
      // El filtro por fecha/direccion/monto va en SQL; el detalle se compara
      // normalizado en memoria porque SQLite no tiene la misma normalización.
      const key = buildIdentityKey(candidato);
      return db
        .select()
        .from(movements)
        .where(
          and(
            eq(movements.fecha, candidato.fecha),
            eq(movements.direccion, candidato.direccion),
            eq(movements.monto_total, candidato.monto_total)
          )
        )
        .all()
        .filter((m) => buildIdentityKey(m) === key);
    },

    findExactPairs(from: string, to: string): { a: Movement; b: Movement }[] {
      const rows = db
        .select()
        .from(movements)
        .where(and(gte(movements.fecha, from), lte(movements.fecha, to)))
        .all();

      const grupos = new Map<string, Movement[]>();
      for (const m of rows) {
        const key = buildIdentityKey(m);
        const grupo = grupos.get(key);
        if (grupo) grupo.push(m);
        else grupos.set(key, [m]);
      }

      const pares: { a: Movement; b: Movement }[] = [];
      for (const grupo of grupos.values()) {
        for (let i = 0; i < grupo.length; i++) {
          for (let j = i + 1; j < grupo.length; j++) {
            const a = grupo[i];
            const b = grupo[j];
            if (!a || !b) continue;
            // Dos filas idénticas de la MISMA imagen son dos operaciones reales
            // que la billetera listó por separado, no un duplicado.
            if (a.source_image_hash !== null && a.source_image_hash === b.source_image_hash) {
              continue;
            }
            pares.push({ a, b });
          }
        }
      }
      return pares;
    },

    findReflejos(from: string, to: string, opts?: { ventanaDias?: number }): ReflejoPair[] {
      const ventanaDias = opts?.ventanaDias ?? 10;
      const rows = db
        .select()
        .from(movements)
        .where(and(gte(movements.fecha, from), lte(movements.fecha, to)))
        .all();

      // Agrupar por monto: el reflejo exige monto exacto, así que sólo hay que
      // comparar dentro de cada grupo.
      const porMonto = new Map<number, Movement[]>();
      for (const m of rows) {
        const grupo = porMonto.get(m.monto_total);
        if (grupo) grupo.push(m);
        else porMonto.set(m.monto_total, [m]);
      }

      const pares: ReflejoPair[] = [];
      for (const grupo of porMonto.values()) {
        for (let i = 0; i < grupo.length; i++) {
          for (let j = i + 1; j < grupo.length; j++) {
            const a = grupo[i];
            const b = grupo[j];
            if (!a || !b) continue;
            // Los espejos (clave de identidad idéntica) son cosa del nivel 1;
            // reportarlos acá sería duplicar el hallazgo.
            if (buildIdentityKey(a) === buildIdentityKey(b)) continue;

            const diasDiff = diasEntre(a.fecha, b.fecha);
            if (diasDiff > ventanaDias) continue;

            pares.push({ a, b, diasDiff, score: diceCoefficient(a.detalle, b.detalle) });
          }
        }
      }

      // ponytail: O(n²) dentro de cada grupo de monto idéntico. Con centenas de
      // filas por mes es irrelevante; revisar si la tabla llega a decenas de miles.
      return pares.sort((x, y) => y.score - x.score);
    },

    recordFinding(input: FindingInput): RecordedFinding {
      const bId = input.movement_b_id ?? null;
      const candidato = input.candidato_json ?? null;

      // Un par es el mismo sin importar el orden: (a,b) === (b,a).
      const existente = db
        .select()
        .from(duplicate_findings)
        .where(
          and(
            eq(duplicate_findings.nivel, input.nivel),
            bId === null
              ? and(
                  eq(duplicate_findings.movement_a_id, input.movement_a_id),
                  isNull(duplicate_findings.movement_b_id),
                  candidato === null
                    ? isNull(duplicate_findings.candidato_json)
                    : eq(duplicate_findings.candidato_json, candidato)
                )
              : or(
                  and(
                    eq(duplicate_findings.movement_a_id, input.movement_a_id),
                    eq(duplicate_findings.movement_b_id, bId)
                  ),
                  and(
                    eq(duplicate_findings.movement_a_id, bId),
                    eq(duplicate_findings.movement_b_id, input.movement_a_id)
                  )
                )
          )
        )
        .get();

      if (existente) return { ...existente, nuevo: false };

      const row = db
        .insert(duplicate_findings)
        .values({
          nivel: input.nivel,
          movement_a_id: input.movement_a_id,
          movement_b_id: bId,
          candidato_json: candidato,
          motivo: input.motivo,
          score: input.score ?? null,
          detectado_en: new Date().toISOString(),
        })
        .returning()
        .all()[0];
      if (!row) throw new Error("No se pudo registrar el finding");
      return { ...row, nuevo: true };
    },

    listFindings(filtro?: { estado?: FindingEstado }): DuplicateFinding[] {
      const base = db.select().from(duplicate_findings);
      return filtro?.estado
        ? base.where(eq(duplicate_findings.estado, filtro.estado)).all()
        : base.all();
    },

    updateFindingEstado(id: number, estado: FindingEstado): DuplicateFinding {
      const row = db
        .update(duplicate_findings)
        .set({ estado })
        .where(eq(duplicate_findings.id, id))
        .returning()
        .all()[0];
      if (!row) throw new Error(`No existe el finding #${id}`);
      return row;
    },
  };
}
