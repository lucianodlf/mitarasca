<script setup lang="ts">
import { AlertTriangle, Link2, Pencil } from "lucide-vue-next";
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDayMonth, formatMoney } from "@/lib/format";
import ObservacionButton from "./ObservacionButton.vue";
import IconPagado from "@/components/icons/IconPagado.vue";
import IconAdeudado from "@/components/icons/IconAdeudado.vue";

export type Installment = {
  id: number;
  debt_id: number;
  nro: number;
  importe: number;
  fecha_prevista: string;
  estado: "pendiente" | "pagada";
  movement_id: number | null;
  observacion: string | null;
  movement_monto_total?: number | null;
};

const props = defineProps<{
  installments: Installment[];
  loading: boolean;
  importeTotalDebt: number;
}>();
const emit = defineEmits<{
  pagar: [installment: Installment];
  observacion: [installment: Installment, value: string | null];
  editar: [installment: Installment];
  verMovimiento: [installment: Installment];
}>();

const sumaCuotas = computed(() =>
  Math.round(props.installments.reduce((acc, i) => acc + i.importe, 0) * 100) / 100
);
const divergeTotal = computed(
  () => Math.round((sumaCuotas.value - props.importeTotalDebt) * 100) / 100 !== 0
);

function diverge(installment: Installment): boolean {
  return (
    installment.movement_monto_total != null &&
    installment.movement_monto_total !== installment.importe
  );
}
</script>

<template>
  <div class="overflow-x-auto border-t border-border">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="w-[60px]">Cuota</TableHead>
          <TableHead class="w-[70px]">Fecha</TableHead>
          <TableHead class="text-right">Importe</TableHead>
          <TableHead class="w-[100px]">Estado</TableHead>
          <TableHead class="w-[64px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading">
          <TableCell colspan="5" class="text-center text-sm text-muted-foreground">Cargando…</TableCell>
        </TableRow>
        <TableRow v-else-if="installments.length === 0">
          <TableCell colspan="5" class="text-center text-sm text-muted-foreground">Sin cuotas.</TableCell>
        </TableRow>
        <TableRow v-for="i in installments" :key="i.id">
          <TableCell class="num text-sm">{{ i.nro }}</TableCell>
          <TableCell class="num text-xs">
            {{ formatDayMonth(i.fecha_prevista) }}
          </TableCell>
          <TableCell class="num text-right">
            <div class="flex items-center justify-end gap-1">
              <AlertTriangle
                v-if="diverge(i)"
                class="size-3 shrink-0 text-accent-foreground"
                :title="`Diverge del movimiento vinculado (${formatMoney(i.movement_monto_total ?? 0)})`"
              />
              {{ formatMoney(i.importe) }}
            </div>
          </TableCell>
          <TableCell>
            <div class="flex items-center gap-1.5">
              <Badge
                class="gap-1"
                :class="i.estado === 'pagada' ? 'bg-pos-soft text-pos' : 'bg-warn-soft text-accent-foreground'"
              >
                <IconPagado v-if="i.estado === 'pagada'" class="size-3" />
                <IconAdeudado v-else class="size-3" />
                {{ i.estado === "pagada" ? "Pagada" : "Pendiente" }}
              </Badge>
              <Button
                v-if="i.estado === 'pendiente'"
                variant="ghost"
                size="icon"
                class="size-6 text-muted-foreground hover:text-pos"
                :aria-label="`Marcar cuota ${i.nro} como pagada`"
                @click.stop="emit('pagar', i)"
              >
                <IconPagado class="size-3.5" />
              </Button>
            </div>
          </TableCell>
          <TableCell>
            <div class="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                class="size-6 text-muted-foreground hover:text-primary"
                :aria-label="`Editar cuota ${i.nro}`"
                @click.stop="emit('editar', i)"
              >
                <Pencil class="size-3.5" />
              </Button>
              <Button
                v-if="i.movement_id != null"
                variant="ghost"
                size="icon"
                class="size-6 text-muted-foreground hover:text-primary"
                :aria-label="`Ver movimiento vinculado a cuota ${i.nro}`"
                @click.stop="emit('verMovimiento', i)"
              >
                <Link2 class="size-3.5" />
              </Button>
              <ObservacionButton
                :observacion="i.observacion"
                :label="`cuota ${i.nro}`"
                @save="(value) => emit('observacion', i, value)"
              />
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
    <div
      v-if="!loading && installments.length > 0 && divergeTotal"
      class="flex items-center gap-1.5 border-t border-border px-3 py-2 text-xs text-accent-foreground"
    >
      <AlertTriangle class="size-3.5 shrink-0" />
      Suma de cuotas ({{ formatMoney(sumaCuotas) }}) distinta del importe total de la deuda
      ({{ formatMoney(importeTotalDebt) }}).
    </div>
  </div>
</template>
