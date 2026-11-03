<script setup lang="ts">
import { ChevronDown, ChevronRight, Pencil } from "@lucide/vue";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import IconCompartido from "@/components/icons/IconCompartido.vue";
import { computed, ref, watch } from "vue";
import { toast } from "vue-sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DebtWithDetail } from "@/composables/useDebts";
import { formatDayMonth, formatMoney } from "@/lib/format";
import { tagBadgeStyle } from "@/lib/tag-color";
import { trpc } from "@/lib/trpc";
import DebtsTable from "./DebtsTable.vue";
import InstallmentEditModal from "./InstallmentEditModal.vue";
import InstallmentsList, { type Installment } from "./InstallmentsList.vue";
import ObservacionButton from "./ObservacionButton.vue";
import EmptyState from "@/components/app/EmptyState.vue";
import EmptyDeudas from "@/components/icons/empty/EmptyDeudas.vue";

const props = defineProps<{
  debts: DebtWithDetail[];
  loading: boolean;
  expandDebtId?: number | null;
  updatedDebtId?: number | null;
  nested?: boolean;
}>();
const emit = defineEmits<{
  edit: [debt: DebtWithDetail];
  observacion: [debt: DebtWithDetail, value: string | null];
  share: [debt: DebtWithDetail];
  changed: [];
  installmentPaid: [debtId: number];
  goToParent: [parentId: number];
  verMovimiento: [installment: Installment];
}>();

const visibleDebts = computed(() => {
  if (props.nested) return props.debts;
  const ids = new Set(props.debts.map((d) => d.id));
  return props.debts.filter((d) => d.parent_debt_id == null || !ids.has(d.parent_debt_id));
});

const expandedId = ref<number | null>(null);
const installmentsByDebt = ref<Record<number, Installment[]>>({});
const installmentsLoading = ref<number | null>(null);
const derivedByDebt = ref<Record<number, DebtWithDetail[]>>({});
const derivedLoading = ref<number | null>(null);
const editModalOpen = ref(false);
const editingInstallment = ref<Installment | null>(null);

watch(
  () => [props.expandDebtId, props.debts] as const,
  ([id, debts]) => {
    if (id == null) return;
    const debt = debts.find((d) => d.id === id);
    if (debt && expandedId.value !== debt.id) {
      expandedId.value = debt.id;
      loadExpandedData(debt);
    }
  },
  { immediate: true }
);

watch(
  () => props.updatedDebtId,
  (debtId) => {
    if (debtId == null || expandedId.value !== debtId) return;
    delete installmentsByDebt.value[debtId];
    loadInstallments(debtId);
  }
);

async function loadInstallments(debtId: number) {
  installmentsLoading.value = debtId;
  try {
    installmentsByDebt.value[debtId] = await trpc.debts.installmentsByDebt.query({ debtId });
  } finally {
    installmentsLoading.value = null;
  }
}

async function loadDerived(debtId: number) {
  derivedLoading.value = debtId;
  try {
    derivedByDebt.value[debtId] = await trpc.debts.derivedDebts.query({ parentId: debtId });
  } finally {
    derivedLoading.value = null;
  }
}

async function loadExpandedData(debt: DebtWithDetail) {
  if (!installmentsByDebt.value[debt.id]) await loadInstallments(debt.id);
  if (debt.derivadas_count > 0 && !derivedByDebt.value[debt.id]) await loadDerived(debt.id);
}

async function toggleExpand(debt: DebtWithDetail) {
  if (expandedId.value === debt.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = debt.id;
  await loadExpandedData(debt);
}

async function onPagar(installment: Installment) {
  try {
    await trpc.debts.toggleInstallmentEstado.mutate({ id: installment.id });
    await loadInstallments(installment.debt_id);
    emit("installmentPaid", installment.debt_id);
    toast.success("Cuota marcada como pagada");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al marcar la cuota como pagada");
  }
}

async function onInstallmentObservacion(installment: Installment, value: string | null) {
  try {
    await trpc.debts.updateInstallment.mutate({ id: installment.id, data: { observacion: value } });
    await loadInstallments(installment.debt_id);
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al guardar la observación");
  }
}

function onEditInstallment(installment: Installment) {
  editingInstallment.value = installment;
  editModalOpen.value = true;
}

async function onSaveInstallment(
  installment: Installment,
  data: { fecha_prevista: string; importe: number; estado: "pendiente" | "pagada" },
  propagarAMovimiento: boolean
) {
  try {
    await trpc.debts.updateInstallment.mutate({
      id: installment.id,
      data: { fecha_prevista: data.fecha_prevista, importe: data.importe, propagarAMovimiento },
    });
    if (data.estado !== installment.estado) {
      await trpc.debts.toggleInstallmentEstado.mutate({ id: installment.id, fecha: data.fecha_prevista });
    }
    editModalOpen.value = false;
    await loadInstallments(installment.debt_id);
    emit("changed");
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Error al actualizar la cuota");
  }
}
</script>

<template>
  <div class="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[28px]" />
          <TableHead class="md:min-w-[180px]">Descripción</TableHead>
          <TableHead class="hidden md:table-cell">Medio de pago</TableHead>
          <TableHead class="hidden md:table-cell">Persona</TableHead>
          <TableHead class="hidden w-[90px] md:table-cell">Últ. pago</TableHead>
          <TableHead class="hidden w-[110px] text-right md:table-cell">Cuota</TableHead>
          <TableHead class="hidden w-[70px] text-right md:table-cell">Cuotas</TableHead>
          <TableHead class="text-right md:w-[130px]">Importe total</TableHead>
          <TableHead class="w-[84px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading">
          <TableCell :colspan="9" class="text-center text-sm text-muted-foreground"><span role="status">Cargando…</span></TableCell>
        </TableRow>
        <TableEmpty v-else-if="visibleDebts.length === 0" :colspan="9">
          <EmptyState
            :icon="EmptyDeudas"
            title="Ninguna deuda por acá"
            description="Lo que debés y lo que te deben va a aparecer acá."
          />
        </TableEmpty>
        <template v-for="d in visibleDebts" :key="d.id">
          <TableRow
            tabindex="0"
            class="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:-outline-offset-2"
            @click="toggleExpand(d)"
            @keydown.enter.self="toggleExpand(d)"
            @keydown.space.self.prevent="toggleExpand(d)"
          >
            <TableCell>
              <Button variant="ghost" size="icon" class="size-6" :aria-label="`Ver detalle de ${d.descripcion}`" :aria-expanded="expandedId === d.id">
                <ChevronDown v-if="expandedId === d.id" class="size-3.5" />
                <ChevronRight v-else class="size-3.5" />
              </Button>
            </TableCell>
            <TableCell class="whitespace-normal md:whitespace-nowrap">
              <div class="flex flex-wrap items-center gap-x-2.5 gap-y-1 md:flex-nowrap">
                <span
                  :class="[
                    'grid size-5.5 shrink-0 place-items-center rounded-md',
                    d.direccion === 'me_deben' ? 'bg-pos-soft text-pos' : 'bg-neg-soft text-neg',
                  ]"
                >
                  <IconIngreso v-if="d.direccion === 'me_deben'" class="size-3.5" />
                  <IconEgreso v-else class="size-3.5" />
                </span>
                <span class="min-w-24 flex-1 wrap-anywhere text-sm md:flex-none md:truncate">{{ d.descripcion }}</span>
                <Badge v-if="d.derivadas_count > 0" variant="secondary" class="shrink-0">Compartida</Badge>
                <Badge
                  v-if="d.parent_debt_id != null"
                  variant="outline"
                  class="shrink-0 cursor-pointer text-xs hover:bg-accent"
                  :aria-label="`Ver deuda padre: ${d.parent_descripcion}`"
                  @click.stop="d.parent_debt_id != null && emit('goToParent', d.parent_debt_id)"
                >
                  Derivada
                </Badge>
              </div>
            </TableCell>
            <TableCell class="hidden md:table-cell">
              <Badge v-if="d.medioPago" variant="secondary" :style="tagBadgeStyle(d.medioPago.color)">
                {{ d.medioPago.nombre }}
              </Badge>
            </TableCell>
            <TableCell class="hidden md:table-cell">
              <Badge v-if="d.persona" variant="secondary" :style="tagBadgeStyle(d.persona.color)">
                {{ d.persona.nombre }}
              </Badge>
            </TableCell>
            <TableCell class="num hidden text-xs md:table-cell">{{ d.fecha_ultimo_pago ? formatDayMonth(d.fecha_ultimo_pago) : "—" }}</TableCell>
            <TableCell class="num hidden text-right text-sm md:table-cell">{{ formatMoney(d.importe_cuota) }}</TableCell>
            <TableCell class="num hidden text-right text-sm md:table-cell">
              {{ d.cuotas_pagadas > 0 ? `${d.cuotas_pagadas}/${d.cuotas_total}` : d.cuotas_total }}
            </TableCell>
            <TableCell class="num text-right font-semibold">{{ formatMoney(d.importe_total + d.ajuste_manual) }}</TableCell>
            <TableCell>
              <div class="flex items-center justify-end gap-1">
                <ObservacionButton
                  :observacion="d.observacion"
                  :label="d.descripcion"
                  @save="(value) => emit('observacion', d, value)"
                />
                <Button
                  v-if="d.direccion === 'yo_debo' && d.parent_debt_id == null"
                  variant="ghost"
                  size="icon"
                  class="size-6"
                  :aria-label="`Compartir ${d.descripcion}`"
                  @click.stop="emit('share', d)"
                >
                  <IconCompartido class="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="size-6"
                  :aria-label="`Editar ${d.descripcion}`"
                  @click.stop="emit('edit', d)"
                >
                  <Pencil class="size-3.5" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
          <TableRow v-if="expandedId === d.id">
            <TableCell :colspan="9" class="bg-muted/30 p-0">
              <InstallmentsList
                :installments="installmentsByDebt[d.id] ?? []"
                :loading="installmentsLoading === d.id"
                :importe-total-debt="d.importe_total + d.ajuste_manual"
                @pagar="onPagar"
                @observacion="onInstallmentObservacion"
                @editar="onEditInstallment"
                @ver-movimiento="(installment) => emit('verMovimiento', installment)"
              />
              <div v-if="d.derivadas_count > 0" class="border-t border-border p-3">
                <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Deudas derivadas
                </p>
                <DebtsTable
                  :debts="derivedByDebt[d.id] ?? []"
                  :loading="derivedLoading === d.id"
                  :updated-debt-id="updatedDebtId"
                  nested
                  @edit="(debt) => emit('edit', debt)"
                  @observacion="(debt, value) => emit('observacion', debt, value)"
                  @share="(debt) => emit('share', debt)"
                  @changed="emit('changed')"
                  @installment-paid="(id) => emit('installmentPaid', id)"
                  @go-to-parent="(id) => emit('goToParent', id)"
                  @ver-movimiento="(installment) => emit('verMovimiento', installment)"
                />
              </div>
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>
  </div>

  <InstallmentEditModal
    :open="editModalOpen"
    :installment="editingInstallment"
    @update:open="(v) => (editModalOpen = v)"
    @save="onSaveInstallment"
  />
</template>
