import { and, eq, gte, lte } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  type Debt,
  type Installment,
  type InstallmentEstado,
  type MovementDirection,
  debts,
  installments,
  movements,
  tags,
} from "../db/schema.js";
import { type CreateMovementInput, makeMovementsRepo } from "../movements/movements.repository.js";

const TAG_TIPO_VARIABLE = "Variable";
const TAG_ESTADO_PAGADO = "Pagado";
const TAG_ESTADO_ADEUDADO = "Adeudado";

export type UpdateInstallmentInput = {
  importe?: number;
  fecha_prevista?: string;
  estado?: InstallmentEstado;
  observacion?: string | null;
  propagarAMovimiento?: boolean;
};

export type InstallmentWithMovement = Installment & { movement_monto_total: number | null };

export type PayInstallmentInput = {
  fecha?: string;
  tagIds: number[];
  detalle?: string;
};

export type MedioPagoProjection = {
  medio_pago_tag_id: number;
  nombre: string;
  cuotas_total: number;
  ajuste_manual: number;
  total: number;
};

export interface InstallmentsRepo {
  generateInstallmentsForDebt(
    debt: Debt,
    options?: {
      startNro?: number;
      cantCuotasRestantes?: number;
      importeRestante?: number;
      cuotaImportes?: number[];
    }
  ): Installment[];
  listInstallmentsByDebt(debtId: number): InstallmentWithMovement[];
  getInstallmentById(id: number): Installment | undefined;
  updateInstallment(id: number, data: UpdateInstallmentInput): Installment;
  payInstallment(id: number, data: PayInstallmentInput): Installment;
  toggleInstallmentEstado(id: number, fecha?: string): Installment;
  rescheduleInstallments(debtId: number, nuevaFechaInicio: string): { updated: number };
  syncInstallmentFromMovement(movementId: number): Installment | undefined;
  projectInstallmentsByMonth(year: number, month: number): MedioPagoProjection[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthDateRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
}

function extractDay(isoDate: string): number {
  return Number(isoDate.split("-")[2]);
}

function addMonthsClamped(isoDate: string, monthsToAdd: number): string {
  const [yearStr, monthStr] = isoDate.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = extractDay(isoDate);

  let targetYear = year;
  let targetMonth = month + monthsToAdd;
  while (targetMonth > 12) {
    targetMonth -= 12;
    targetYear += 1;
  }
  while (targetMonth < 1) {
    targetMonth += 12;
    targetYear -= 1;
  }

  const lastDay = new Date(targetYear, targetMonth, 0).getDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${pad(targetMonth)}-${pad(clampedDay)}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function computeFechaPrevista(
  fechaInicio: string,
  nroIndex: number,
  frecuencia: Debt["frecuencia"],
  frecuenciaDias: number | null
): string {
  if (frecuencia === "dias") {
    const step = frecuenciaDias ?? 30;
    return addDays(fechaInicio, step * nroIndex);
  }
  return addMonthsClamped(fechaInicio, nroIndex);
}

function debtDireccionToMovementDireccion(direccion: Debt["direccion"]): MovementDirection {
  return direccion === "yo_debo" ? "out" : "in";
}

function debtTagIds(debt: Debt): number[] {
  return [debt.concepto_tag_id, debt.medio_pago_tag_id, debt.persona_tag_id].filter(
    (id): id is number => id != null
  );
}

function findTagByEstado(db: DbClient, nombre: string) {
  const tag = db
    .select()
    .from(tags)
    .where(and(eq(tags.kind, "estado"), eq(tags.nombre, nombre)))
    .get();
  if (!tag) throw new Error(`No se encontró el tag estado="${nombre}". Verifique el seed de tags.`);
  return tag;
}

function findTagTipoVariable(db: DbClient) {
  const tag = db
    .select()
    .from(tags)
    .where(and(eq(tags.kind, "tipo"), eq(tags.nombre, TAG_TIPO_VARIABLE)))
    .get();
  if (!tag) {
    throw new Error(
      `No se encontró el tag tipo="${TAG_TIPO_VARIABLE}". Verifique el seed de tags.`
    );
  }
  return tag;
}

export function repartirConResiduo(total: number, n: number): number[] {
  const base = round2(total / n);
  const importes = new Array(n).fill(base);
  const residuo = round2(total - base * n);
  importes[n - 1] = round2(importes[n - 1] + residuo);
  return importes;
}

export function makeInstallmentsRepo(db: DbClient): InstallmentsRepo {
  const movementsRepo = makeMovementsRepo(db);

  function setMovementEstado(movementId: number, estadoNombre: string): void {
    const movement = movementsRepo.getMovementById(movementId);
    if (!movement) return;
    const estadoTag = findTagByEstado(db, estadoNombre);
    const tagIds = [
      ...movement.tags.filter((t) => t.kind !== "estado").map((t) => t.id),
      estadoTag.id,
    ];
    movementsRepo.updateMovement(movementId, {}, tagIds);
  }

  return {
    generateInstallmentsForDebt(
      debt: Debt,
      options?: {
        startNro?: number;
        cantCuotasRestantes?: number;
        importeRestante?: number;
        cuotaImportes?: number[];
      }
    ): Installment[] {
      const startNro = options?.startNro ?? 1;
      const cantCuotas = options?.cantCuotasRestantes ?? debt.cant_cuotas;
      const importeTotal = options?.importeRestante ?? debt.importe_total;
      const cuotaImportes = options?.cuotaImportes ?? repartirConResiduo(importeTotal, cantCuotas);

      const newRows: Array<typeof installments.$inferInsert> = [];

      for (let i = 0; i < cantCuotas; i++) {
        const nro = startNro + i;
        const cuotaImporte = cuotaImportes[i] ?? 0;
        const fecha_prevista = computeFechaPrevista(
          debt.fecha_inicio,
          nro - 1,
          debt.frecuencia,
          debt.frecuencia_dias
        );

        newRows.push({
          debt_id: debt.id,
          nro,
          importe: cuotaImporte,
          fecha_prevista,
          estado: "pendiente",
          movement_id: null,
          fecha_pago: null,
        });
      }

      if (newRows.length === 0) return [];
      const created = db.insert(installments).values(newRows).returning().all();

      const tagAdeudado = findTagByEstado(db, TAG_ESTADO_ADEUDADO);
      const tagTipoVariable = findTagTipoVariable(db);
      const direccionMovement = debtDireccionToMovementDireccion(debt.direccion);

      for (const installment of created) {
        const movement = movementsRepo.createMovement(
          {
            fecha: installment.fecha_prevista,
            direccion: direccionMovement,
            monto_total: installment.importe,
            detalle: `Cta ${installment.nro}/${debt.cant_cuotas} - ${debt.descripcion.slice(0, 100)}`,
            installment_id: installment.id,
          },
          [tagTipoVariable.id, tagAdeudado.id, ...debtTagIds(debt)]
        );
        db.update(installments)
          .set({ movement_id: movement.id })
          .where(eq(installments.id, installment.id))
          .run();
        installment.movement_id = movement.id;
      }

      return created;
    },

    listInstallmentsByDebt(debtId: number): InstallmentWithMovement[] {
      const rows = db
        .select({
          installment: installments,
          movement_monto_total: movements.monto_total,
        })
        .from(installments)
        .leftJoin(movements, eq(installments.movement_id, movements.id))
        .where(eq(installments.debt_id, debtId))
        .all();
      return rows.map(({ installment, movement_monto_total }) => ({
        ...installment,
        movement_monto_total: movement_monto_total ?? null,
      }));
    },

    getInstallmentById(id: number): Installment | undefined {
      return db.select().from(installments).where(eq(installments.id, id)).get();
    },

    updateInstallment(id: number, data: UpdateInstallmentInput): Installment {
      const existing = db.select().from(installments).where(eq(installments.id, id)).get();
      if (!existing) throw new Error(`Cuota ${id} no encontrada`);

      const delta: Partial<typeof installments.$inferInsert> = {};
      if ("importe" in data) delta.importe = data.importe;
      if ("fecha_prevista" in data) delta.fecha_prevista = data.fecha_prevista;
      if ("estado" in data) delta.estado = data.estado;
      if ("observacion" in data) delta.observacion = data.observacion ?? null;

      if (Object.keys(delta).length === 0) return existing;
      // ponytail: no derivamos fecha_pago acá; solo pagos vía payInstallment/toggleInstallmentEstado la setean.

      const rows = db
        .update(installments)
        .set(delta)
        .where(eq(installments.id, id))
        .returning()
        .all();
      const updated = rows[0];
      if (!updated) throw new Error(`No se pudo actualizar la cuota ${id}`);

      if (data.fecha_prevista !== undefined && existing.movement_id != null) {
        movementsRepo.updateMovement(existing.movement_id, { fecha: data.fecha_prevista });
      }

      if (
        data.importe !== undefined &&
        existing.movement_id != null &&
        data.propagarAMovimiento !== false
      ) {
        movementsRepo.updateMovement(existing.movement_id, { monto_total: data.importe });
      }

      return updated;
    },

    rescheduleInstallments(debtId: number, nuevaFechaInicio: string): { updated: number } {
      const debt = db.select().from(debts).where(eq(debts.id, debtId)).get();
      if (!debt) throw new Error(`Deuda ${debtId} no encontrada`);

      const rows = db
        .select()
        .from(installments)
        .where(eq(installments.debt_id, debtId))
        .all()
        .sort((a, b) => a.nro - b.nro);

      let updated = 0;
      db.transaction((tx) => {
        for (const installment of rows) {
          const fecha_prevista = computeFechaPrevista(
            nuevaFechaInicio,
            installment.nro - 1,
            debt.frecuencia,
            debt.frecuencia_dias
          );

          tx.update(installments)
            .set({
              fecha_prevista,
              ...(installment.estado === "pagada" ? { fecha_pago: fecha_prevista } : {}),
            })
            .where(eq(installments.id, installment.id))
            .run();

          if (installment.movement_id != null) {
            tx.update(movements)
              .set({
                fecha: fecha_prevista,
                detalle: `Cta ${installment.nro}/${debt.cant_cuotas} - ${debt.descripcion.slice(0, 100)}`,
              })
              .where(eq(movements.id, installment.movement_id))
              .run();
          }

          updated++;
        }
      });

      return { updated };
    },

    payInstallment(id: number, data: PayInstallmentInput): Installment {
      const existing = db.select().from(installments).where(eq(installments.id, id)).get();
      if (!existing) throw new Error(`Cuota ${id} no encontrada`);
      if (existing.estado === "pagada") {
        throw new Error(`Cuota ${id} ya está pagada`);
      }

      const debt = db.select().from(debts).where(eq(debts.id, existing.debt_id)).get();
      if (!debt) throw new Error(`Deuda ${existing.debt_id} no encontrada`);

      const fecha = data.fecha ?? existing.fecha_prevista;
      const direccionMovement = debtDireccionToMovementDireccion(debt.direccion);

      // El installment ya nace con un movimiento (generateInstallmentsForDebt).
      // Pagar actualiza ese movimiento en vez de crear uno duplicado.
      if (existing.movement_id != null) {
        const movement = movementsRepo.updateMovement(
          existing.movement_id,
          { fecha, ...(data.detalle !== undefined ? { detalle: data.detalle } : {}) },
          data.tagIds
        );
        const rows = db
          .update(installments)
          .set({ estado: "pagada", fecha_pago: movement.fecha })
          .where(eq(installments.id, id))
          .returning()
          .all();
        const updated = rows[0];
        if (!updated) throw new Error(`No se pudo marcar la cuota ${id} como pagada`);
        return updated;
      }

      const movementInput: CreateMovementInput = {
        fecha,
        direccion: direccionMovement,
        monto_total: existing.importe,
        detalle: data.detalle ?? `${debt.descripcion} - cuota ${existing.nro}`,
        installment_id: existing.id,
      };

      const movement = movementsRepo.createMovement(movementInput, data.tagIds);

      const rows = db
        .update(installments)
        .set({ estado: "pagada", movement_id: movement.id, fecha_pago: movement.fecha })
        .where(eq(installments.id, id))
        .returning()
        .all();
      const updated = rows[0];
      if (!updated) throw new Error(`No se pudo marcar la cuota ${id} como pagada`);
      return updated;
    },

    toggleInstallmentEstado(id: number, fecha?: string): Installment {
      const existing = db.select().from(installments).where(eq(installments.id, id)).get();
      if (!existing) throw new Error(`Cuota ${id} no encontrada`);

      if (existing.estado === "pendiente") {
        if (existing.movement_id == null) {
          const debt = db.select().from(debts).where(eq(debts.id, existing.debt_id)).get();
          if (!debt) throw new Error(`Deuda ${existing.debt_id} no encontrada`);
          const tagPagado = findTagByEstado(db, TAG_ESTADO_PAGADO);
          const tagTipoVariable = findTagTipoVariable(db);
          const movement = movementsRepo.createMovement(
            {
              fecha: fecha ?? existing.fecha_prevista,
              direccion: debtDireccionToMovementDireccion(debt.direccion),
              monto_total: existing.importe,
              detalle: `Cta ${existing.nro}/${debt.cant_cuotas} - ${debt.descripcion.slice(0, 100)}`,
              installment_id: existing.id,
            },
            [tagTipoVariable.id, tagPagado.id, ...debtTagIds(debt)]
          );
          const rows = db
            .update(installments)
            .set({ estado: "pagada", movement_id: movement.id, fecha_pago: movement.fecha })
            .where(eq(installments.id, id))
            .returning()
            .all();
          const updated = rows[0];
          if (!updated) throw new Error(`No se pudo marcar la cuota ${id} como pagada`);
          return updated;
        }

        setMovementEstado(existing.movement_id, TAG_ESTADO_PAGADO);

        const rows = db
          .update(installments)
          .set({ estado: "pagada", fecha_pago: fecha ?? existing.fecha_prevista })
          .where(eq(installments.id, id))
          .returning()
          .all();
        const updated = rows[0];
        if (!updated) throw new Error(`No se pudo marcar la cuota ${id} como pagada`);
        return updated;
      }

      if (existing.movement_id != null) {
        setMovementEstado(existing.movement_id, TAG_ESTADO_ADEUDADO);
      }

      const rows = db
        .update(installments)
        .set({ estado: "pendiente", fecha_pago: null })
        .where(eq(installments.id, id))
        .returning()
        .all();
      const updated = rows[0];
      if (!updated) throw new Error(`No se pudo marcar la cuota ${id} como pendiente`);
      return updated;
    },

    syncInstallmentFromMovement(movementId: number): Installment | undefined {
      const installment = db
        .select()
        .from(installments)
        .where(eq(installments.movement_id, movementId))
        .get();
      if (!installment) return undefined;

      const movement = db.select().from(movements).where(eq(movements.id, movementId)).get();
      if (!movement) return undefined;

      const movementTags = movementsRepo.getMovementById(movementId)?.tags ?? [];
      const isPagado = movementTags.some(
        (t) => t.kind === "estado" && t.nombre === TAG_ESTADO_PAGADO
      );
      const nextEstado: InstallmentEstado = isPagado ? "pagada" : "pendiente";

      if (nextEstado === installment.estado && movement.fecha === installment.fecha_prevista) {
        return installment;
      }

      const rows = db
        .update(installments)
        .set({
          estado: nextEstado,
          fecha_pago: nextEstado === "pagada" ? movement.fecha : null,
          fecha_prevista: movement.fecha,
        })
        .where(eq(installments.id, installment.id))
        .returning()
        .all();
      return rows[0];
    },

    projectInstallmentsByMonth(year: number, month: number): MedioPagoProjection[] {
      const { from, to } = monthDateRange(year, month);

      const rows = db
        .select({ installment: installments, debt: debts })
        .from(installments)
        .innerJoin(debts, eq(installments.debt_id, debts.id))
        .where(
          and(
            eq(debts.direccion, "yo_debo"),
            eq(installments.estado, "pendiente"),
            gte(installments.fecha_prevista, from),
            lte(installments.fecha_prevista, to)
          )
        )
        .all();

      const byMedioPago = new Map<
        number,
        { cuotas_total: number; ajuste_manual: number; debtIds: Set<number> }
      >();

      for (const { installment, debt } of rows) {
        if (debt.medio_pago_tag_id == null) continue;
        const existing = byMedioPago.get(debt.medio_pago_tag_id) ?? {
          cuotas_total: 0,
          ajuste_manual: 0,
          debtIds: new Set<number>(),
        };
        existing.cuotas_total = round2(existing.cuotas_total + installment.importe);
        if (!existing.debtIds.has(debt.id)) {
          existing.debtIds.add(debt.id);
          existing.ajuste_manual = round2(existing.ajuste_manual + debt.ajuste_manual);
        }
        byMedioPago.set(debt.medio_pago_tag_id, existing);
      }

      const result: MedioPagoProjection[] = [];
      for (const [medio_pago_tag_id, { cuotas_total, ajuste_manual }] of byMedioPago.entries()) {
        const tag = db.select().from(tags).where(eq(tags.id, medio_pago_tag_id)).get();
        if (!tag) continue;
        result.push({
          medio_pago_tag_id,
          nombre: tag.nombre,
          cuotas_total,
          ajuste_manual,
          total: round2(cuotas_total + ajuste_manual),
        });
      }

      return result;
    },
  };
}
