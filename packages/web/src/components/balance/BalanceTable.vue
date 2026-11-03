<script setup lang="ts">
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { YearSummaryWithEstimate } from "@/composables/useBalance";
import { formatMoney } from "@/lib/format";

const props = defineProps<{ summary: YearSummaryWithEstimate | null; loading: boolean }>();

const monthLabel = (month: number) =>
  new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(2000, month - 1, 1));

function balanceClass(balance: number) {
  if (balance > 0) return "text-pos";
  if (balance < 0) return "text-neg";
  return "";
}
</script>

<template>
  <div class="overflow-x-auto">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead class="min-w-[100px]">Mes</TableHead>
          <TableHead class="text-right">Ingresos</TableHead>
          <TableHead class="text-right">Egresos</TableHead>
          <TableHead class="text-right">Balance</TableHead>
          <TableHead v-if="summary?.includesVariableEstimate" class="text-right">
            Var. estimada
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading">
          <TableCell :colspan="summary?.includesVariableEstimate ? 5 : 4" class="text-center text-sm text-muted-foreground">
            <span role="status">Cargando…</span>
          </TableCell>
        </TableRow>
        <template v-else-if="summary">
          <TableRow v-for="m in summary.months" :key="m.month">
            <TableCell class="capitalize">{{ monthLabel(m.month) }}</TableCell>
            <TableCell class="num text-right text-pos">{{ formatMoney(m.ingresos) }}</TableCell>
            <TableCell class="num text-right text-neg">{{ formatMoney(m.egresos) }}</TableCell>
            <TableCell class="num text-right font-semibold" :class="balanceClass(m.balance)">
              {{ formatMoney(m.balance) }}
            </TableCell>
            <TableCell v-if="summary.includesVariableEstimate" class="num text-right text-muted-foreground">
              {{ m.estimatedVariable != null ? formatMoney(m.estimatedVariable) : "—" }}
            </TableCell>
          </TableRow>
          <TableRow class="border-t-2 border-border font-semibold">
            <TableCell>Total</TableCell>
            <TableCell class="num text-right text-pos">{{ formatMoney(summary.ingresos) }}</TableCell>
            <TableCell class="num text-right text-neg">{{ formatMoney(summary.egresos) }}</TableCell>
            <TableCell class="num text-right" :class="balanceClass(summary.balance)">
              {{ formatMoney(summary.balance) }}
            </TableCell>
            <TableCell v-if="summary.includesVariableEstimate" />
          </TableRow>
        </template>
      </TableBody>
    </Table>
  </div>
</template>
