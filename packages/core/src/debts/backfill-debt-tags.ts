// Corrección puntual de datos históricos (issue-022): agrega a los movimientos de cuotas creados
// antes de `debtTagIds` los tags de concepto, medio de pago y persona de su deuda.
// No se exporta desde el barrel: lo usa solo scripts/backfill-debt-tags.ts.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { debts, installments, movement_tags, tags } from "../db/schema.js";

export interface BackfillResult {
  /** Movimientos que reciben al menos un tag. */
  movements: number;
  /** Pares movimiento-tag agregados (o a agregar si no se aplica). */
  tags: number;
}

export function backfillDebtTags(db: DbClient, opts: { apply: boolean }): BackfillResult {
  const rows = db
    .select({
      movementId: installments.movement_id,
      concepto: debts.concepto_tag_id,
      medio_pago: debts.medio_pago_tag_id,
      persona: debts.persona_tag_id,
    })
    .from(installments)
    .innerJoin(debts, eq(debts.id, installments.debt_id))
    .where(and(isNull(debts.deleted_at), isNotNull(installments.movement_id)))
    .all();

  const toInsert: { movement_id: number; tag_id: number }[] = [];
  for (const row of rows) {
    const movementId = row.movementId as number;
    const kinds = new Set(
      db
        .select({ kind: tags.kind })
        .from(movement_tags)
        .innerJoin(tags, eq(tags.id, movement_tags.tag_id))
        .where(eq(movement_tags.movement_id, movementId))
        .all()
        .map((t) => t.kind)
    );
    // Si el movimiento ya tiene un tag de ese kind (p. ej. editado a mano), no se agrega otro.
    for (const kind of ["concepto", "medio_pago", "persona"] as const) {
      const tagId = row[kind];
      if (tagId != null && !kinds.has(kind))
        toInsert.push({ movement_id: movementId, tag_id: tagId });
    }
  }

  if (opts.apply && toInsert.length > 0) {
    db.transaction((tx) => {
      tx.insert(movement_tags).values(toInsert).onConflictDoNothing().run();
    });
  }
  return { movements: new Set(toInsert.map((r) => r.movement_id)).size, tags: toInsert.length };
}
