import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  type Movement,
  type MovementDirection,
  type MovementShare,
  type ReglaOp,
  type Tag,
  movement_shares,
  movement_tags,
  movements,
  tags,
} from "../db/schema.js";
import { validateMovementTags } from "../tags/tags.validation.js";

export type MovementWithTags = Movement & { tags: Tag[] };

export type CreateMovementInput = {
  fecha: string;
  direccion: MovementDirection;
  monto_total: number;
  regla_op?: ReglaOp;
  regla_factor?: number | null;
  detalle: string;
  observacion?: string | null;
  installment_id?: number | null;
  source_movement_id?: number | null;
  imported_at?: string | null;
  source_image_hash?: string | null;
  pago_total_propio?: boolean | null;
};

export type UpdateMovementInput = Partial<CreateMovementInput>;

export type SummarizeResult = { ingresos: number; egresos: number; balance: number };

const ESTADO_PAGADO = "Pagado";
const ESTADO_ADEUDADO = "Adeudado";
const ESTADO_DESHABILITADO = "Deshabilitado";

export { ESTADO_PAGADO, ESTADO_ADEUDADO, ESTADO_DESHABILITADO };

function findTagByEstado(db: DbClient, nombre: string) {
  const tag = db
    .select()
    .from(tags)
    .where(and(eq(tags.kind, "estado"), eq(tags.nombre, nombre)))
    .get();
  if (!tag) throw new Error(`No se encontró el tag estado="${nombre}". Verifique el seed de tags.`);
  return tag;
}

export interface MovementsRepo {
  createMovement(data: CreateMovementInput, tagIds: number[]): MovementWithTags;
  getMovementById(id: number): MovementWithTags | undefined;
  getLastMovement(): MovementWithTags | undefined;
  listMovementsByDateRange(
    from: string,
    to: string
  ): (MovementWithTags & { shares_pendientes: boolean })[];
  listMovementsByDirection(
    direccion: MovementDirection
  ): (MovementWithTags & { shares_pendientes: boolean })[];
  listMovementsByTag(tagId: number): MovementWithTags[];
  updateMovement(id: number, data: UpdateMovementInput, tagIds?: number[]): MovementWithTags;
  deleteMovement(id: number): void;
  toggleMovementEstado(id: number): MovementWithTags;
  listMovementShares(movementId: number): MovementShare[];
  updateMovementShare(
    id: number,
    data: { persona_tag_id?: number | null; pagado?: boolean }
  ): MovementShare;
  summarizeByMonth(year: number, month: number, mode: "proyectado" | "real"): SummarizeResult;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeMontoEfectivo(
  monto_total: number,
  regla_op: ReglaOp,
  regla_factor: number | null
): number {
  if (regla_op === "none") return round2(monto_total);
  if (regla_factor == null || regla_factor <= 0) {
    throw new Error(`regla_factor debe ser > 0 cuando regla_op es "${regla_op}"`);
  }
  if (regla_op === "div") return round2(monto_total / regla_factor);
  if (regla_op === "mul") return round2(monto_total * regla_factor);
  throw new Error(`regla_op desconocido: "${regla_op}"`);
}

export function requiresShares(
  direccion: MovementDirection,
  regla_op: ReglaOp,
  regla_factor: number | null
): boolean {
  return direccion === "out" && regla_op === "div" && (regla_factor ?? 0) > 1;
}

function syncMovementShares(db: DbClient, movement: Movement): void {
  const targetCount = requiresShares(movement.direccion, movement.regla_op, movement.regla_factor)
    ? Math.round(movement.regla_factor as number) - 1
    : 0;

  const existing = db
    .select()
    .from(movement_shares)
    .where(eq(movement_shares.movement_id, movement.id))
    .all();

  if (existing.length < targetCount) {
    const toInsert = targetCount - existing.length;
    db.insert(movement_shares)
      .values(
        Array.from({ length: toInsert }, () => ({
          movement_id: movement.id,
          persona_tag_id: null,
          pagado: false,
        }))
      )
      .run();
  } else if (existing.length > targetCount) {
    const toRemove = existing.slice(targetCount);
    db.delete(movement_shares)
      .where(
        inArray(
          movement_shares.id,
          toRemove.map((s) => s.id)
        )
      )
      .run();
  }
}

function loadSharesPendientes(db: DbClient, ids: number[]): Set<number> {
  if (ids.length === 0) return new Set();
  const rows = db
    .select({ movement_id: movement_shares.movement_id })
    .from(movement_shares)
    .where(and(inArray(movement_shares.movement_id, ids), eq(movement_shares.pagado, false)))
    .all();
  return new Set(rows.map((r) => r.movement_id));
}

export function loadTagsForMovements(db: DbClient, ids: number[]): Map<number, Tag[]> {
  if (ids.length === 0) return new Map();
  const rows = db
    .select({ tag: tags, movement_id: movement_tags.movement_id })
    .from(tags)
    .innerJoin(movement_tags, eq(tags.id, movement_tags.tag_id))
    .where(inArray(movement_tags.movement_id, ids))
    .all();
  const map = new Map<number, Tag[]>();
  for (const { tag, movement_id } of rows) {
    const list = map.get(movement_id) ?? [];
    list.push(tag);
    map.set(movement_id, list);
  }
  return map;
}

export function makeMovementsRepo(db: DbClient): MovementsRepo {
  return {
    createMovement(data: CreateMovementInput, tagIds: number[]): MovementWithTags {
      const tagRows =
        tagIds.length > 0 ? db.select().from(tags).where(inArray(tags.id, tagIds)).all() : [];
      const validation = validateMovementTags(tagRows.map((t) => ({ kind: t.kind })));
      if (!validation.ok) throw new Error(`Tags inválidos: ${JSON.stringify(validation.errors)}`);

      const regla_op = data.regla_op ?? "none";
      const regla_factor = data.regla_factor ?? null;
      const monto_efectivo = computeMontoEfectivo(data.monto_total, regla_op, regla_factor);

      const rows = db
        .insert(movements)
        .values({
          fecha: data.fecha,
          direccion: data.direccion,
          monto_total: data.monto_total,
          regla_op,
          regla_factor: data.regla_factor ?? null,
          monto_efectivo,
          detalle: data.detalle,
          observacion: data.observacion ?? null,
          installment_id: data.installment_id ?? null,
          source_movement_id: data.source_movement_id ?? null,
          imported_at: data.imported_at ?? null,
          source_image_hash: data.source_image_hash ?? null,
          pago_total_propio: data.pago_total_propio ?? null,
        })
        .returning()
        .all();
      const movement = rows[0];
      if (!movement) throw new Error("No se pudo crear el movimiento");

      if (tagIds.length > 0) {
        db.insert(movement_tags)
          .values(tagIds.map((tag_id) => ({ movement_id: movement.id, tag_id })))
          .run();
      }

      syncMovementShares(db, movement);
      return { ...movement, tags: tagRows };
    },

    getMovementById(id: number): MovementWithTags | undefined {
      const movement = db.select().from(movements).where(eq(movements.id, id)).get();
      if (!movement) return undefined;
      const tagMap = loadTagsForMovements(db, [id]);
      return { ...movement, tags: tagMap.get(id) ?? [] };
    },

    getLastMovement(): MovementWithTags | undefined {
      const movement = db
        .select()
        .from(movements)
        .orderBy(desc(movements.fecha), desc(movements.id))
        .limit(1)
        .get();
      if (!movement) return undefined;
      const tagMap = loadTagsForMovements(db, [movement.id]);
      return { ...movement, tags: tagMap.get(movement.id) ?? [] };
    },

    listMovementsByDateRange(
      from: string,
      to: string
    ): (MovementWithTags & { shares_pendientes: boolean })[] {
      const rows = db
        .select()
        .from(movements)
        .where(and(gte(movements.fecha, from), lte(movements.fecha, to)))
        .all();
      if (rows.length === 0) return [];
      const ids = rows.map((m) => m.id);
      const tagMap = loadTagsForMovements(db, ids);
      const pendientes = loadSharesPendientes(db, ids);
      return rows.map((m) => ({
        ...m,
        tags: tagMap.get(m.id) ?? [],
        shares_pendientes: pendientes.has(m.id),
      }));
    },

    listMovementsByDirection(
      direccion: MovementDirection
    ): (MovementWithTags & { shares_pendientes: boolean })[] {
      const rows = db.select().from(movements).where(eq(movements.direccion, direccion)).all();
      if (rows.length === 0) return [];
      const ids = rows.map((m) => m.id);
      const tagMap = loadTagsForMovements(db, ids);
      const pendientes = loadSharesPendientes(db, ids);
      return rows.map((m) => ({
        ...m,
        tags: tagMap.get(m.id) ?? [],
        shares_pendientes: pendientes.has(m.id),
      }));
    },

    listMovementsByTag(tagId: number): MovementWithTags[] {
      const rows = db
        .select({ movement: movements })
        .from(movements)
        .innerJoin(movement_tags, eq(movements.id, movement_tags.movement_id))
        .where(eq(movement_tags.tag_id, tagId))
        .all()
        .map((r) => r.movement);
      if (rows.length === 0) return [];
      const tagMap = loadTagsForMovements(
        db,
        rows.map((m) => m.id)
      );
      return rows.map((m) => ({ ...m, tags: tagMap.get(m.id) ?? [] }));
    },

    updateMovement(id: number, data: UpdateMovementInput, tagIds?: number[]): MovementWithTags {
      const existing = db.select().from(movements).where(eq(movements.id, id)).get();
      if (!existing) throw new Error(`Movement ${id} no encontrado`);

      let newTagRows: Tag[] | undefined;
      if (tagIds !== undefined) {
        newTagRows =
          tagIds.length > 0 ? db.select().from(tags).where(inArray(tags.id, tagIds)).all() : [];
        const validation = validateMovementTags(newTagRows.map((t) => ({ kind: t.kind })));
        if (!validation.ok) throw new Error(`Tags inválidos: ${JSON.stringify(validation.errors)}`);
      }

      const regla_op = data.regla_op ?? existing.regla_op;
      const monto_total = data.monto_total ?? existing.monto_total;
      const regla_factor =
        "regla_factor" in data ? (data.regla_factor ?? null) : existing.regla_factor;
      const monto_efectivo = computeMontoEfectivo(monto_total, regla_op, regla_factor);

      const delta: Partial<typeof movements.$inferInsert> = { monto_efectivo, regla_op };
      if ("fecha" in data) delta.fecha = data.fecha;
      if ("direccion" in data) delta.direccion = data.direccion;
      if ("monto_total" in data) delta.monto_total = data.monto_total;
      if ("regla_factor" in data) delta.regla_factor = data.regla_factor ?? null;
      if ("detalle" in data) delta.detalle = data.detalle;
      if ("observacion" in data) delta.observacion = data.observacion ?? null;
      if ("installment_id" in data) delta.installment_id = data.installment_id ?? null;
      if ("source_movement_id" in data) delta.source_movement_id = data.source_movement_id ?? null;
      if ("pago_total_propio" in data) delta.pago_total_propio = data.pago_total_propio ?? null;

      const updatedRows = db
        .update(movements)
        .set(delta)
        .where(eq(movements.id, id))
        .returning()
        .all();
      const updated = updatedRows[0];
      if (!updated) throw new Error(`No se pudo actualizar el movimiento ${id}`);

      if (tagIds !== undefined) {
        db.delete(movement_tags).where(eq(movement_tags.movement_id, id)).run();
        if (tagIds.length > 0) {
          db.insert(movement_tags)
            .values(tagIds.map((tag_id) => ({ movement_id: id, tag_id })))
            .run();
        }
      }

      syncMovementShares(db, updated);
      const tagMap = loadTagsForMovements(db, [id]);
      return { ...updated, tags: tagMap.get(id) ?? [] };
    },

    deleteMovement(id: number): void {
      db.delete(movement_tags).where(eq(movement_tags.movement_id, id)).run();
      db.delete(movement_shares).where(eq(movement_shares.movement_id, id)).run();
      db.delete(movements).where(eq(movements.id, id)).run();
    },

    toggleMovementEstado(id: number): MovementWithTags {
      const existing = db.select().from(movements).where(eq(movements.id, id)).get();
      if (!existing) throw new Error(`Movement ${id} no encontrado`);
      const currentTags = loadTagsForMovements(db, [id]).get(id) ?? [];
      const isDeshabilitado = currentTags.some(
        (t) => t.kind === "estado" && t.nombre === ESTADO_DESHABILITADO
      );
      if (isDeshabilitado) {
        throw new Error("No se puede cambiar el estado de un movimiento deshabilitado");
      }
      const isPagado = currentTags.some((t) => t.kind === "estado" && t.nombre === ESTADO_PAGADO);
      const estadoTag = findTagByEstado(db, isPagado ? ESTADO_ADEUDADO : ESTADO_PAGADO);
      const tagIds = [
        ...currentTags.filter((t) => t.kind !== "estado").map((t) => t.id),
        estadoTag.id,
      ];
      const result = this.updateMovement(id, {}, tagIds);

      const becamePagado = !isPagado;
      if (becamePagado && existing.pago_total_propio === false) {
        db.update(movement_shares)
          .set({ pagado: true, fecha_pago: new Date().toISOString().slice(0, 10) })
          .where(eq(movement_shares.movement_id, id))
          .run();
      }

      return result;
    },

    listMovementShares(movementId: number): MovementShare[] {
      return db
        .select()
        .from(movement_shares)
        .where(eq(movement_shares.movement_id, movementId))
        .all();
    },

    updateMovementShare(
      id: number,
      data: { persona_tag_id?: number | null; pagado?: boolean }
    ): MovementShare {
      const delta: Partial<typeof movement_shares.$inferInsert> = {};
      if ("persona_tag_id" in data) delta.persona_tag_id = data.persona_tag_id ?? null;
      if ("pagado" in data) {
        delta.pagado = data.pagado;
        delta.fecha_pago = data.pagado ? new Date().toISOString().slice(0, 10) : null;
      }
      const rows = db
        .update(movement_shares)
        .set(delta)
        .where(eq(movement_shares.id, id))
        .returning()
        .all();
      const updated = rows[0];
      if (!updated) throw new Error(`movement_share ${id} no encontrada`);
      return updated;
    },

    summarizeByMonth(year: number, month: number, mode: "proyectado" | "real"): SummarizeResult {
      const pad = (n: number) => String(n).padStart(2, "0");
      const from = `${year}-${pad(month)}-01`;
      const to = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;

      const sumForDirection = (direccion: MovementDirection): number => {
        if (mode === "proyectado") {
          const result = db
            .select({ total: sql<string>`sum(${movements.monto_efectivo})` })
            .from(movements)
            .where(
              and(
                gte(movements.fecha, from),
                lte(movements.fecha, to),
                eq(movements.direccion, direccion),
                sql`NOT EXISTS (
                  SELECT 1 FROM ${movement_tags}
                  INNER JOIN ${tags} ON ${tags.id} = ${movement_tags.tag_id}
                  WHERE ${movement_tags.movement_id} = ${movements.id}
                    AND ${tags.kind} = 'estado'
                    AND ${tags.nombre} = ${ESTADO_DESHABILITADO}
                )`
              )
            )
            .get();
          return Number(result?.total) || 0;
        }

        const result = db
          .select({ total: sql<string>`sum(${movements.monto_efectivo})` })
          .from(movements)
          .innerJoin(movement_tags, eq(movements.id, movement_tags.movement_id))
          .innerJoin(tags, eq(movement_tags.tag_id, tags.id))
          .where(
            and(
              gte(movements.fecha, from),
              lte(movements.fecha, to),
              eq(movements.direccion, direccion),
              eq(tags.kind, "estado"),
              eq(tags.nombre, ESTADO_PAGADO)
            )
          )
          .get();
        return Number(result?.total) || 0;
      };

      const ingresos = sumForDirection("in");
      const egresos = sumForDirection("out");
      return { ingresos, egresos, balance: ingresos - egresos };
    },
  };
}

export { makeMovementsRepo as makeRepo };
