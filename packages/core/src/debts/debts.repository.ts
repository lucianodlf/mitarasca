import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import {
  type Debt,
  type DebtDirection,
  type DebtFrecuencia,
  type Tag,
  debts,
  installments,
  movements,
  tags,
} from "../db/schema.js";
import { makeMovementsRepo } from "../movements/movements.repository.js";
import { validateDebtInput } from "./debts.validation.js";
import { makeInstallmentsRepo, repartirConResiduo } from "./installments.repository.js";

export type DebtWithDetail = Debt & {
  persona: Tag | null;
  medioPago: Tag | null;
  concepto: Tag | null;
  estado: "adeudada" | "pendiente" | "pagada";
  fecha_ultimo_pago: string | null;
  importe_cuota: number;
  cuotas_pagadas: number;
  cuotas_total: number;
  pagado: number;
  resto: number;
  derivadas_count: number;
  parent_descripcion: string | null;
};

export type CreateDebtInput = {
  descripcion: string;
  direccion: DebtDirection;
  medio_pago_tag_id?: number | null;
  concepto_tag_id?: number | null;
  persona_tag_id?: number | null;
  parent_debt_id?: number | null;
  importe_total: number;
  cant_cuotas: number;
  ajuste_manual?: number;
  fecha: string;
  fecha_inicio: string;
  frecuencia?: DebtFrecuencia;
  frecuencia_dias?: number | null;
  observacion?: string | null;
};

export type UpdateDebtInput = Partial<CreateDebtInput>;

export type DebtTotals = {
  deuda_total: number;
  pagado: number;
  resto: number;
};

export type MedioPagoTotals = DebtTotals & {
  medio_pago_tag_id: number;
  nombre: string;
};

export type PersonaTotalsBidireccional = {
  persona_tag_id: number;
  nombre: string;
  me_debe: number;
  le_debo: number;
};

export type ShareSplit = {
  persona_tag_id: number;
  importe?: number;
  porcentaje?: number;
  medio_pago_tag_id?: number | null;
};

export interface DebtsRepo {
  createDebt(data: CreateDebtInput): DebtWithDetail;
  getDebtById(id: number): DebtWithDetail | undefined;
  listDebts(direccion?: DebtDirection): DebtWithDetail[];
  updateDebt(id: number, data: UpdateDebtInput): DebtWithDetail;
  deleteDebt(id: number, opts?: { deleteMovements?: boolean; deleteDerived?: boolean }): void;
  totalsByMedioPago(): MedioPagoTotals[];
  totalsByPersonaBidireccional(): PersonaTotalsBidireccional[];
  shareDebt(parentId: number, splits: ShareSplit[]): DebtWithDetail[];
  listDerivedDebts(parentId: number): DebtWithDetail[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function makeDebtsRepo(db: DbClient): DebtsRepo {
  function loadMedioPago(medio_pago_tag_id: number | null): Tag | null {
    if (medio_pago_tag_id == null) return null;
    return db.select().from(tags).where(eq(tags.id, medio_pago_tag_id)).get() ?? null;
  }

  function loadConcepto(concepto_tag_id: number | null): Tag | null {
    if (concepto_tag_id == null) return null;
    return db.select().from(tags).where(eq(tags.id, concepto_tag_id)).get() ?? null;
  }

  function loadPersona(persona_tag_id: number | null): Tag | null {
    if (persona_tag_id == null) return null;
    return db.select().from(tags).where(eq(tags.id, persona_tag_id)).get() ?? null;
  }

  function installmentStats(debtId: number): {
    total: number;
    pagadas: number;
    ultimaFechaPago: string | null;
    importeCuota: number;
    pagadoImporte: number;
  } {
    const rows = db.select().from(installments).where(eq(installments.debt_id, debtId)).all();
    const pagadas = rows.filter((r) => r.estado === "pagada");
    const ultimaFechaPago = pagadas.reduce<string | null>((max, r) => {
      if (!r.fecha_pago) return max;
      return max === null || r.fecha_pago > max ? r.fecha_pago : max;
    }, null);
    return {
      total: rows.length,
      pagadas: pagadas.length,
      ultimaFechaPago,
      importeCuota: rows[0]?.importe ?? 0,
      pagadoImporte: round2(pagadas.reduce((acc, r) => acc + r.importe, 0)),
    };
  }

  function sumInstallments(debtId: number, estado: "pendiente" | "pagada"): number {
    const rows = db
      .select()
      .from(installments)
      .where(and(eq(installments.debt_id, debtId), eq(installments.estado, estado)))
      .all();
    return round2(rows.reduce((acc, r) => acc + r.importe, 0));
  }

  function countDerived(debtId: number): number {
    return db
      .select()
      .from(debts)
      .where(and(eq(debts.parent_debt_id, debtId), isNull(debts.deleted_at)))
      .all().length;
  }

  function loadParentDescripcion(parentDebtId: number | null): string | null {
    if (parentDebtId == null) return null;
    const parent = db.select().from(debts).where(eq(debts.id, parentDebtId)).get();
    return parent?.descripcion ?? null;
  }

  function toDebtWithDetail(debt: Debt): DebtWithDetail {
    const { total, pagadas, ultimaFechaPago, importeCuota, pagadoImporte } = installmentStats(
      debt.id
    );
    const estado: DebtWithDetail["estado"] =
      pagadas === 0 ? "adeudada" : pagadas >= total ? "pagada" : "pendiente";
    const resto = round2(debt.importe_total + debt.ajuste_manual - pagadoImporte);
    return {
      ...debt,
      persona: loadPersona(debt.persona_tag_id),
      medioPago: loadMedioPago(debt.medio_pago_tag_id),
      concepto: loadConcepto(debt.concepto_tag_id),
      estado,
      fecha_ultimo_pago: ultimaFechaPago,
      importe_cuota: importeCuota,
      cuotas_pagadas: pagadas,
      cuotas_total: total,
      pagado: pagadoImporte,
      resto,
      derivadas_count: countDerived(debt.id),
      parent_descripcion: loadParentDescripcion(debt.parent_debt_id),
    };
  }

  function validateAndResolve(data: {
    direccion: string;
    importe_total: number;
    cant_cuotas: number;
    medio_pago_tag_id?: number | null | undefined;
    persona_tag_id?: number | null | undefined;
  }): { medioPagoTag: Tag | null; personaTag: Tag | null } {
    const medioPagoTagId = data.medio_pago_tag_id ?? null;
    const personaTagId = data.persona_tag_id ?? null;

    const medioPagoTag = medioPagoTagId != null ? loadMedioPago(medioPagoTagId) : null;
    const personaTag = personaTagId != null ? loadPersona(personaTagId) : null;

    const validation = validateDebtInput({
      direccion: data.direccion,
      importe_total: data.importe_total,
      cant_cuotas: data.cant_cuotas,
      medioPagoTag: medioPagoTag ?? undefined,
      medioPagoTagId,
      personaTag: personaTag ?? undefined,
      personaTagId,
    });
    if (!validation.ok) {
      throw new Error(`Datos de deuda inválidos: ${JSON.stringify(validation.errors)}`);
    }

    return { medioPagoTag, personaTag };
  }

  function insertDebtWithInstallments(tx: DbClient, data: CreateDebtInput): Debt {
    const rows = tx
      .insert(debts)
      .values({
        descripcion: data.descripcion,
        direccion: data.direccion,
        medio_pago_tag_id: data.medio_pago_tag_id ?? null,
        concepto_tag_id: data.concepto_tag_id ?? null,
        persona_tag_id: data.persona_tag_id ?? null,
        parent_debt_id: data.parent_debt_id ?? null,
        importe_total: data.importe_total,
        cant_cuotas: data.cant_cuotas,
        ajuste_manual: data.ajuste_manual ?? 0,
        fecha: data.fecha,
        fecha_inicio: data.fecha_inicio,
        frecuencia: data.frecuencia ?? "mensual",
        frecuencia_dias: data.frecuencia_dias ?? null,
        observacion: data.observacion ?? null,
      })
      .returning()
      .all();
    const created = rows[0];
    if (!created) throw new Error("No se pudo crear la deuda");

    makeInstallmentsRepo(tx).generateInstallmentsForDebt(created);

    return created;
  }

  return {
    createDebt(data: CreateDebtInput): DebtWithDetail {
      validateAndResolve(data);

      const debt = db.transaction((tx) => insertDebtWithInstallments(tx, data));

      return toDebtWithDetail(debt);
    },

    getDebtById(id: number): DebtWithDetail | undefined {
      const debt = db
        .select()
        .from(debts)
        .where(and(eq(debts.id, id), isNull(debts.deleted_at)))
        .get();
      if (!debt) return undefined;
      return toDebtWithDetail(debt);
    },

    listDebts(direccion?: DebtDirection): DebtWithDetail[] {
      const rows =
        direccion !== undefined
          ? db
              .select()
              .from(debts)
              .where(and(eq(debts.direccion, direccion), isNull(debts.deleted_at)))
              .all()
          : db.select().from(debts).where(isNull(debts.deleted_at)).all();
      if (rows.length === 0) return [];
      return rows.map(toDebtWithDetail);
    },

    updateDebt(id: number, data: UpdateDebtInput): DebtWithDetail {
      const existing = db.select().from(debts).where(eq(debts.id, id)).get();
      if (!existing) throw new Error(`Deuda ${id} no encontrada`);

      const direccion = data.direccion ?? existing.direccion;
      const importe_total = data.importe_total ?? existing.importe_total;
      const cant_cuotas = data.cant_cuotas ?? existing.cant_cuotas;
      const medio_pago_tag_id =
        "medio_pago_tag_id" in data ? (data.medio_pago_tag_id ?? null) : existing.medio_pago_tag_id;
      const persona_tag_id =
        "persona_tag_id" in data ? (data.persona_tag_id ?? null) : existing.persona_tag_id;

      validateAndResolve({
        direccion,
        importe_total,
        cant_cuotas,
        medio_pago_tag_id,
        persona_tag_id,
      });

      const updated = db.transaction((tx) => {
        const pagadas = tx
          .select()
          .from(installments)
          .where(and(eq(installments.debt_id, id), eq(installments.estado, "pagada")))
          .all();
        if (cant_cuotas < pagadas.length) {
          throw new Error(
            `No se puede reducir cant_cuotas a ${cant_cuotas}: ya hay ${pagadas.length} cuota(s) pagada(s)`
          );
        }

        const regeneraCuotas =
          ("importe_total" in data && data.importe_total !== existing.importe_total) ||
          ("cant_cuotas" in data && data.cant_cuotas !== existing.cant_cuotas) ||
          ("frecuencia" in data && data.frecuencia !== existing.frecuencia) ||
          ("frecuencia_dias" in data && data.frecuencia_dias !== existing.frecuencia_dias) ||
          ("direccion" in data && data.direccion !== existing.direccion);

        const delta: Partial<typeof debts.$inferInsert> = {};
        if ("descripcion" in data) delta.descripcion = data.descripcion;
        if ("direccion" in data) delta.direccion = data.direccion;
        if ("medio_pago_tag_id" in data) delta.medio_pago_tag_id = data.medio_pago_tag_id ?? null;
        if ("concepto_tag_id" in data) delta.concepto_tag_id = data.concepto_tag_id ?? null;
        if ("persona_tag_id" in data) delta.persona_tag_id = data.persona_tag_id ?? null;
        if ("importe_total" in data) delta.importe_total = data.importe_total;
        if ("cant_cuotas" in data) delta.cant_cuotas = data.cant_cuotas;
        if ("ajuste_manual" in data) delta.ajuste_manual = data.ajuste_manual ?? 0;
        if ("fecha" in data) delta.fecha = data.fecha;
        if ("fecha_inicio" in data) delta.fecha_inicio = data.fecha_inicio;
        if ("frecuencia" in data) delta.frecuencia = data.frecuencia;
        if ("frecuencia_dias" in data) delta.frecuencia_dias = data.frecuencia_dias ?? null;
        if ("observacion" in data) delta.observacion = data.observacion ?? null;

        const updatedRows =
          Object.keys(delta).length > 0
            ? tx.update(debts).set(delta).where(eq(debts.id, id)).returning().all()
            : [existing];
        const updatedDebt = updatedRows[0];
        if (!updatedDebt) throw new Error(`No se pudo actualizar la deuda ${id}`);

        if (regeneraCuotas) {
          const pendientes = tx
            .select()
            .from(installments)
            .where(and(eq(installments.debt_id, id), eq(installments.estado, "pendiente")))
            .all();
          const movementIds = pendientes
            .map((p) => p.movement_id)
            .filter((mid): mid is number => mid != null);

          tx.delete(installments)
            .where(and(eq(installments.debt_id, id), eq(installments.estado, "pendiente")))
            .run();

          if (movementIds.length > 0) {
            tx.delete(movements).where(inArray(movements.id, movementIds)).run();
          }

          const cuotaImportes = repartirConResiduo(importe_total, cant_cuotas);
          const installmentsRepo = makeInstallmentsRepo(tx);

          const pagadasOrdenadas = [...pagadas].sort((a, b) => a.nro - b.nro);
          for (let i = 0; i < pagadasOrdenadas.length; i++) {
            const pagada = pagadasOrdenadas[i];
            if (!pagada) continue;
            const nuevoImporte = cuotaImportes[i] ?? 0;
            if (nuevoImporte === pagada.importe) continue;
            tx.update(installments)
              .set({ importe: nuevoImporte })
              .where(eq(installments.id, pagada.id))
              .run();
            if (pagada.movement_id != null) {
              makeMovementsRepo(tx).updateMovement(pagada.movement_id, {
                monto_total: nuevoImporte,
              });
            }
          }

          const cuotasPendientes = cant_cuotas - pagadas.length;
          if (cuotasPendientes > 0) {
            installmentsRepo.generateInstallmentsForDebt(updatedDebt, {
              startNro: pagadas.length + 1,
              cantCuotasRestantes: cuotasPendientes,
              cuotaImportes: cuotaImportes.slice(pagadas.length),
            });
          }
        }

        return updatedDebt;
      });

      return toDebtWithDetail(updated);
    },

    deleteDebt(id: number, opts?: { deleteMovements?: boolean; deleteDerived?: boolean }): void {
      const deleteMovements = opts?.deleteMovements ?? true;
      const now = new Date().toISOString();

      function deleteOne(debtId: number) {
        const linkedInstallments = db
          .select()
          .from(installments)
          .where(eq(installments.debt_id, debtId))
          .all();
        const movementIds = linkedInstallments
          .map((i) => i.movement_id)
          .filter((mid): mid is number => mid != null);

        if (movementIds.length > 0) {
          if (deleteMovements) {
            db.delete(movements).where(inArray(movements.id, movementIds)).run();
          } else {
            db.update(movements)
              .set({ installment_id: null })
              .where(inArray(movements.id, movementIds))
              .run();
          }
        }
        db.delete(installments).where(eq(installments.debt_id, debtId)).run();
        db.update(debts).set({ deleted_at: now }).where(eq(debts.id, debtId)).run();
        console.log(
          `[debts] soft-delete deuda id=${debtId}: ${linkedInstallments.length} cuota(s) eliminadas, movimientos ${deleteMovements ? "eliminados" : "desvinculados"}, at=${now}`
        );
      }

      if (opts?.deleteDerived) {
        const derived = db
          .select()
          .from(debts)
          .where(and(eq(debts.parent_debt_id, id), isNull(debts.deleted_at)))
          .all();
        for (const d of derived) deleteOne(d.id);
      }

      deleteOne(id);
    },

    totalsByMedioPago(): MedioPagoTotals[] {
      const allDebts = db.select().from(debts).where(isNull(debts.deleted_at)).all();
      const byTag = new Map<number, { nombre: string; deuda_total: number; pagado: number }>();

      for (const debt of allDebts) {
        if (debt.medio_pago_tag_id == null) continue;
        const tag = loadMedioPago(debt.medio_pago_tag_id);
        if (!tag) continue;
        const deuda = round2(debt.importe_total + debt.ajuste_manual);
        const pagado = debt.direccion === "yo_debo" ? sumInstallments(debt.id, "pagada") : 0;
        const existing = byTag.get(tag.id);
        byTag.set(tag.id, {
          nombre: tag.nombre,
          deuda_total: round2((existing?.deuda_total ?? 0) + deuda),
          pagado: round2((existing?.pagado ?? 0) + pagado),
        });
      }

      return Array.from(byTag.entries()).map(
        ([medio_pago_tag_id, { nombre, deuda_total, pagado }]) => ({
          medio_pago_tag_id,
          nombre,
          deuda_total,
          pagado,
          resto: round2(deuda_total - pagado),
        })
      );
    },

    totalsByPersonaBidireccional(): PersonaTotalsBidireccional[] {
      const allDebts = db
        .select()
        .from(debts)
        .where(isNull(debts.deleted_at))
        .all()
        .filter((d) => d.persona_tag_id != null);
      if (allDebts.length === 0) return [];

      const byTag = new Map<number, { nombre: string; me_debe: number; le_debo: number }>();

      for (const debt of allDebts) {
        const personaTagId = debt.persona_tag_id;
        if (personaTagId == null) continue;
        const tag = loadPersona(personaTagId);
        if (!tag) continue;
        const pagado = sumInstallments(debt.id, "pagada");
        const resto = round2(debt.importe_total + debt.ajuste_manual - pagado);
        const existing = byTag.get(personaTagId) ?? { nombre: tag.nombre, me_debe: 0, le_debo: 0 };
        if (debt.direccion === "me_deben") {
          existing.me_debe = round2(existing.me_debe + resto);
        } else {
          existing.le_debo = round2(existing.le_debo + resto);
        }
        byTag.set(personaTagId, existing);
      }

      return Array.from(byTag.entries()).map(([persona_tag_id, v]) => ({
        persona_tag_id,
        ...v,
      }));
    },

    shareDebt(parentId: number, splits: ShareSplit[]): DebtWithDetail[] {
      const parent = db.select().from(debts).where(eq(debts.id, parentId)).get();
      if (!parent) throw new Error(`Deuda ${parentId} no encontrada`);
      if (parent.deleted_at != null) throw new Error(`Deuda ${parentId} está eliminada`);
      if (parent.direccion !== "yo_debo") {
        throw new Error("Solo se pueden compartir deudas yo_debo");
      }
      if (parent.parent_debt_id != null) {
        throw new Error("No se puede compartir una deuda que ya es derivada");
      }
      if (splits.length === 0) throw new Error("shareDebt requiere al menos un split");

      const existingDerivedPersonaIds = new Set(
        db
          .select()
          .from(debts)
          .where(and(eq(debts.parent_debt_id, parentId), isNull(debts.deleted_at)))
          .all()
          .map((d) => d.persona_tag_id)
      );

      const seenPersonaIds = new Set<number>();
      let sumImportes = 0;
      const resolvedSplits = splits.map((split) => {
        const personaTag = loadPersona(split.persona_tag_id);
        if (!personaTag) throw new Error(`Persona ${split.persona_tag_id} no encontrada`);
        if (personaTag.kind !== "persona") {
          throw new Error(`Tag ${split.persona_tag_id} no es de kind persona`);
        }
        if (existingDerivedPersonaIds.has(split.persona_tag_id)) {
          throw new Error(`Ya existe una derivada para la persona ${split.persona_tag_id}`);
        }
        if (seenPersonaIds.has(split.persona_tag_id)) {
          throw new Error(`Persona ${split.persona_tag_id} duplicada en los splits`);
        }
        seenPersonaIds.add(split.persona_tag_id);

        const hasImporte = split.importe != null;
        const hasPorcentaje = split.porcentaje != null;
        if (hasImporte === hasPorcentaje) {
          throw new Error("Cada split requiere exactamente uno de importe o porcentaje");
        }

        const importe = hasImporte
          ? (split.importe as number)
          : round2(((split.porcentaje as number) / 100) * parent.importe_total);
        if (!(importe > 0)) throw new Error("El importe del split debe ser mayor a 0");

        sumImportes = round2(sumImportes + importe);

        return {
          persona_tag_id: split.persona_tag_id,
          importe,
          medio_pago_tag_id: split.medio_pago_tag_id,
        };
      });

      if (sumImportes > parent.importe_total + 0.01) {
        throw new Error(
          `La suma de los splits (${sumImportes}) excede el importe total del padre (${parent.importe_total})`
        );
      }

      const created = db.transaction((tx) =>
        resolvedSplits.map((split) =>
          insertDebtWithInstallments(tx, {
            descripcion: parent.descripcion,
            direccion: "me_deben",
            concepto_tag_id: parent.concepto_tag_id,
            medio_pago_tag_id: split.medio_pago_tag_id ?? null,
            persona_tag_id: split.persona_tag_id,
            parent_debt_id: parentId,
            importe_total: split.importe,
            cant_cuotas: parent.cant_cuotas,
            ajuste_manual: 0,
            fecha: parent.fecha,
            fecha_inicio: parent.fecha_inicio,
            frecuencia: parent.frecuencia,
            frecuencia_dias: parent.frecuencia_dias,
          })
        )
      );

      return created.map(toDebtWithDetail);
    },

    listDerivedDebts(parentId: number): DebtWithDetail[] {
      const rows = db
        .select()
        .from(debts)
        .where(and(eq(debts.parent_debt_id, parentId), isNull(debts.deleted_at)))
        .all();
      return rows.map(toDebtWithDetail);
    },
  };
}
