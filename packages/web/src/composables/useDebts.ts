import { trpc } from "@/lib/trpc";
import { ref, watch } from "vue";

type DebtDirection = "yo_debo" | "me_deben";
type DebtFrecuencia = "mensual" | "dias";

export type Tag = { id: number; kind: string; nombre: string; color: string; activo: boolean };

export type DebtWithDetail = {
  id: number;
  descripcion: string;
  direccion: DebtDirection;
  medio_pago_tag_id: number | null;
  concepto_tag_id: number | null;
  persona_tag_id: number | null;
  parent_debt_id: number | null;
  importe_total: number;
  cant_cuotas: number;
  ajuste_manual: number;
  fecha: string;
  fecha_inicio: string;
  frecuencia: DebtFrecuencia;
  frecuencia_dias: number | null;
  observacion: string | null;
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

export type DeleteDebtOptions = { deleteMovements?: boolean; deleteDerived?: boolean };

export type ShareSplit = {
  persona_tag_id: number;
  importe?: number;
  porcentaje?: number;
  medio_pago_tag_id?: number | null;
};

export type DebtTotals = { deuda_total: number; pagado: number; resto: number };
export type MedioPagoTotals = DebtTotals & { medio_pago_tag_id: number; nombre: string };
export type PersonaTotals = {
  persona_tag_id: number;
  nombre: string;
  me_debe: number;
  le_debo: number;
};

/** Deudas bidireccionales (yo_debo/me_deben) con totales por medio de pago y por persona. */
export function useDebts() {
  const direccionFilter = ref<DebtDirection | null>(null);

  const debts = ref<DebtWithDetail[]>([]);
  const totalsByMedioPago = ref<MedioPagoTotals[]>([]);
  const totalsByPersona = ref<PersonaTotals[]>([]);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function refetch() {
    loading.value = true;
    error.value = null;
    try {
      const [list, medioPago, persona] = await Promise.all([
        trpc.debts.list.query(
          direccionFilter.value ? { direccion: direccionFilter.value } : undefined
        ),
        trpc.debts.totalsByMedioPago.query(),
        trpc.debts.totalsByPersona.query(),
      ]);
      debts.value = list;
      totalsByMedioPago.value = medioPago;
      totalsByPersona.value = persona;
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Error al cargar las deudas";
    } finally {
      loading.value = false;
    }
  }

  async function patchDebt(id: number) {
    const [updated, medioPago, persona] = await Promise.all([
      trpc.debts.getById.query({ id }),
      trpc.debts.totalsByMedioPago.query(),
      trpc.debts.totalsByPersona.query(),
    ]);
    if (updated) {
      const idx = debts.value.findIndex((d) => d.id === id);
      if (idx !== -1) debts.value[idx] = updated;
    }
    totalsByMedioPago.value = medioPago;
    totalsByPersona.value = persona;
  }

  async function create(data: CreateDebtInput) {
    await trpc.debts.create.mutate(data);
    await refetch();
  }

  async function update(id: number, data: UpdateDebtInput) {
    await trpc.debts.update.mutate({ id, data });
    await refetch();
  }

  async function rescheduleInstallments(debtId: number, fechaInicio: string) {
    const result = await trpc.debts.rescheduleInstallments.mutate({ debtId, fechaInicio });
    await refetch();
    return result;
  }

  async function remove(id: number, opts?: DeleteDebtOptions) {
    await trpc.debts.delete.mutate({ id, ...opts });
    await refetch();
  }

  async function share(parentId: number, splits: ShareSplit[]) {
    await trpc.debts.share.mutate({ parentId, splits });
    await refetch();
  }

  async function updateObservacion(id: number, observacion: string | null) {
    await trpc.debts.update.mutate({ id, data: { observacion } });
    await refetch();
  }

  watch(direccionFilter, refetch, { immediate: true });

  return {
    direccionFilter,
    debts,
    totalsByMedioPago,
    totalsByPersona,
    loading,
    error,
    refetch,
    patchDebt,
    create,
    update,
    rescheduleInstallments,
    remove,
    share,
    updateObservacion,
  };
}
