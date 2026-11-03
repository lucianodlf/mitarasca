<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import DebtForm from "@/components/debts/DebtForm.vue";
import DebtsFilters from "@/components/debts/DebtsFilters.vue";
import DebtsTable from "@/components/debts/DebtsTable.vue";
import DebtTotals from "@/components/debts/DebtTotals.vue";
import ShareDebtModal from "@/components/debts/ShareDebtModal.vue";
import { type DebtWithDetail, type DeleteDebtOptions, useDebts } from "@/composables/useDebts";
import { trpc } from "@/lib/trpc";

const route = useRoute();
const router = useRouter();
const expandDebtId = ref<number | null>(null);
const updatedDebtId = ref<number | null>(null);

const {
  direccionFilter,
  debts,
  totalsByMedioPago,
  totalsByPersona,
  loading,
  error,
  create,
  update,
  rescheduleInstallments,
  remove,
  share,
  updateObservacion,
  refetch,
  patchDebt,
} = useDebts();

const formOpen = ref(false);
const editingDebt = ref<DebtWithDetail | null>(null);
const shareOpen = ref(false);
const sharingDebt = ref<DebtWithDetail | null>(null);

watch(formOpen, (isOpen) => {
  if (!isOpen) editingDebt.value = null;
});

watch(shareOpen, (isOpen) => {
  if (!isOpen) sharingDebt.value = null;
});

function onEditRequest(debt: DebtWithDetail) {
  editingDebt.value = debt;
  formOpen.value = true;
}

function onShareRequest(debt: DebtWithDetail) {
  sharingDebt.value = debt;
  shareOpen.value = true;
}

async function onSubmit(
  data: Parameters<typeof create>[0],
  recalcularFechas: boolean,
  done: () => void
) {
  try {
    if (editingDebt.value) {
      const debtId = editingDebt.value.id;
      await update(debtId, data);
      updatedDebtId.value = debtId;
      if (recalcularFechas) {
        const { updated } = await rescheduleInstallments(debtId, data.fecha_inicio);
        toast.success(`Deuda actualizada — ${updated} cuota(s) recalculada(s)`);
      } else {
        toast.success("Deuda actualizada");
      }
    } else {
      await create(data);
      toast.success("Deuda creada");
    }
    formOpen.value = false;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al guardar la deuda");
  } finally {
    done();
  }
}

async function onShareSubmit(splits: Parameters<typeof share>[1], done: () => void) {
  if (!sharingDebt.value) return;
  try {
    await share(sharingDebt.value.id, splits);
    toast.success("Deuda compartida");
    shareOpen.value = false;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al compartir la deuda");
  } finally {
    done();
  }
}

async function onDelete(id: number, opts: DeleteDebtOptions) {
  try {
    await remove(id, opts);
    toast.success("Deuda eliminada");
    formOpen.value = false;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al eliminar la deuda");
  }
}

async function onObservacion(debt: DebtWithDetail, value: string | null) {
  try {
    await updateObservacion(debt.id, value);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al guardar la observación");
  }
}

function onGoToParent(parentId: number) {
  direccionFilter.value = null;
  router.push({ query: { debtId: String(parentId) } });
}

async function onVerMovimiento(installment: { movement_id: number | null }) {
  if (installment.movement_id == null) return;
  const movement = await trpc.movements.getById.query({ id: installment.movement_id });
  if (!movement) return;
  const [year, month] = movement.fecha.split("-");
  router.push({
    name: movement.direccion === "out" ? "egresos" : "ingresos",
    query: { movementId: String(movement.id), y: year, m: String(Number(month)) },
  });
}

watch(
  () => route.query.installmentId,
  async (raw) => {
    if (typeof raw !== "string") return;
    const installment = await trpc.debts.installmentById.query({ id: Number(raw) });
    if (installment) expandDebtId.value = installment.debt_id;
    router.replace({ query: {} });
  },
  { immediate: true }
);

watch(
  () => route.query.debtId,
  (raw) => {
    if (typeof raw !== "string") return;
    expandDebtId.value = Number(raw);
    router.replace({ query: {} });
  },
  { immediate: true }
);
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4">
      <h1 class="text-xl font-bold tracking-tight font-display">Deudas</h1>
    </header>

    <div v-if="error" role="alert" class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {{ error }}
    </div>

    <DebtTotals :totals-by-medio-pago="totalsByMedioPago" :totals-by-persona="totalsByPersona" />

    <DebtsFilters
      :direccion-filter="direccionFilter"
      @update:direccion-filter="(v) => (direccionFilter = v)"
      @nuevo="formOpen = true"
    />

    <div class="rounded-xl border border-border bg-card">
      <DebtsTable
        :debts="debts"
        :loading="loading"
        :expand-debt-id="expandDebtId"
        :updated-debt-id="updatedDebtId"
        @edit="onEditRequest"
        @observacion="onObservacion"
        @share="onShareRequest"
        @changed="refetch"
        @installment-paid="patchDebt"
        @go-to-parent="onGoToParent"
        @ver-movimiento="onVerMovimiento"
      />
    </div>

    <DebtForm
      v-model:open="formOpen"
      :debt="editingDebt ?? undefined"
      @submit="onSubmit"
      @delete="onDelete"
    />

    <ShareDebtModal
      v-model:open="shareOpen"
      :debt="sharingDebt ?? undefined"
      @submit="onShareSubmit"
    />
  </div>
</template>
