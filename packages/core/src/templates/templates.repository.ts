import { and, eq } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { type Movement, type Tag, movements, tags } from "../db/schema.js";
import { type MovementWithTags, makeMovementsRepo } from "../movements/movements.repository.js";

const TAG_TIPO_FIJO = "Fijo";
const TAG_ESTADO_ADEUDADO = "Adeudado";

export type GeneratedTemplateResult = {
  sourceYear: number;
  sourceMonth: number;
  targetYear: number;
  targetMonth: number;
  created: MovementWithTags[];
  skipped: Array<{ source_movement_id: number; detalle: string }>;
};

export interface TemplatesRepo {
  generateMonthFromPrevious(year: number, month: number): GeneratedTemplateResult;
}

function previousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

function monthDateRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

function clampDateToMonth(day: number, targetYear: number, targetMonth: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`;
}

function extractDay(isoDate: string): number {
  return Number(isoDate.split("-")[2]);
}

function isFijo(m: MovementWithTags): boolean {
  return m.tags.some((t) => t.kind === "tipo" && t.nombre === TAG_TIPO_FIJO);
}

function findTagAdeudado(db: DbClient): Tag {
  const tag = db
    .select()
    .from(tags)
    .where(and(eq(tags.kind, "estado"), eq(tags.nombre, TAG_ESTADO_ADEUDADO)))
    .get();
  if (!tag) {
    throw new Error(
      `No se encontró el tag estado="${TAG_ESTADO_ADEUDADO}". Verifique el seed de tags.`
    );
  }
  return tag;
}

function findExistingCopy(db: DbClient, sourceMovementId: number): Movement | undefined {
  return db
    .select()
    .from(movements)
    .where(eq(movements.source_movement_id, sourceMovementId))
    .get();
}

export function makeTemplatesRepo(db: DbClient): TemplatesRepo {
  return {
    generateMonthFromPrevious(year: number, month: number): GeneratedTemplateResult {
      const { year: sourceYear, month: sourceMonth } = previousMonth(year, month);

      const tagAdeudado = findTagAdeudado(db);

      const { from, to } = monthDateRange(sourceYear, sourceMonth);
      const movementsRepo = makeMovementsRepo(db);
      const sourceMovements = movementsRepo.listMovementsByDateRange(from, to);
      const fijos = sourceMovements.filter(isFijo);

      const created: MovementWithTags[] = [];
      const skipped: GeneratedTemplateResult["skipped"] = [];

      for (const source of fijos) {
        const existing = findExistingCopy(db, source.id);
        if (existing) {
          skipped.push({ source_movement_id: source.id, detalle: source.detalle });
          continue;
        }

        const newTagIds = [
          ...source.tags.filter((t) => t.kind !== "estado").map((t) => t.id),
          tagAdeudado.id,
        ];

        const fecha = clampDateToMonth(extractDay(source.fecha), year, month);

        const newMovement = movementsRepo.createMovement(
          {
            fecha,
            direccion: source.direccion,
            monto_total: source.monto_total,
            regla_op: source.regla_op,
            regla_factor: source.regla_factor,
            detalle: source.detalle,
            observacion: source.observacion,
            installment_id: null,
            source_movement_id: source.id,
          },
          newTagIds
        );

        created.push(newMovement);
      }

      return { sourceYear, sourceMonth, targetYear: year, targetMonth: month, created, skipped };
    },
  };
}
