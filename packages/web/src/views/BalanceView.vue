<script setup lang="ts">
import BalanceControls from "@/components/balance/BalanceControls.vue";
import BalanceTable from "@/components/balance/BalanceTable.vue";
import { useBalance } from "@/composables/useBalance";
import { formatMoney } from "@/lib/format";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import IconBalance from "@/components/icons/IconBalance.vue";

const { year, mode, includeVariableEstimate, summary, loading, error, shiftYear } = useBalance();
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4">
      <h1 class="text-xl font-bold tracking-tight font-display">Balance anual</h1>
    </header>

    <div v-if="error" class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {{ error }}
    </div>

    <div class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconIngreso class="size-3.5" /> Ingresos
        </div>
        <div class="num mt-1.5 text-2xl font-semibold text-pos">
          {{ summary ? formatMoney(summary.ingresos) : "…" }}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconEgreso class="size-3.5" /> Egresos
        </div>
        <div class="num mt-1.5 text-2xl font-semibold text-neg">
          {{ summary ? formatMoney(summary.egresos) : "…" }}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconBalance class="size-3.5" /> Balance
        </div>
        <div class="num mt-1.5 text-2xl font-semibold">
          {{ summary ? formatMoney(summary.balance) : "…" }}
        </div>
      </div>
    </div>

    <BalanceControls
      :year="year"
      :mode="mode"
      :include-variable-estimate="includeVariableEstimate"
      @shift-year="shiftYear"
      @update:mode="(v) => (mode = v)"
      @update:include-variable-estimate="(v) => (includeVariableEstimate = v)"
    />

    <div class="rounded-xl border border-border bg-card">
      <BalanceTable :summary="summary" :loading="loading" />
    </div>
  </div>
</template>
