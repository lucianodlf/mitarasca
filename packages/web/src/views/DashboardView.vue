<script setup lang="ts">
import { CreditCard } from "lucide-vue-next";
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import { useBalance } from "@/composables/useBalance";
import { useDebts } from "@/composables/useDebts";
import { formatMoney } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import IconIngreso from "@/components/icons/IconIngreso.vue";
import IconEgreso from "@/components/icons/IconEgreso.vue";
import IconBalance from "@/components/icons/IconBalance.vue";

const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;

const summary = ref<{ ingresos: number; egresos: number; balance: number } | null>(null);
const summaryError = ref<string | null>(null);
const summaryLoading = ref(true);

onMounted(async () => {
  try {
    summary.value = await trpc.movements.summarizeByMonth.query({ year, month, mode: "proyectado" });
  } catch (e) {
    summaryError.value = e instanceof Error ? e.message : "Error al cargar el resumen";
  } finally {
    summaryLoading.value = false;
  }
});

const { summary: yearSummary, loading: yearLoading, error: yearError } = useBalance();
const { debts, loading: debtsLoading, error: debtsError } = useDebts();

const debtTotals = computed(() => {
  const yoDebo = debts.value
    .filter((d) => d.direccion === "yo_debo")
    .reduce((acc, d) => acc + d.importe_total + d.ajuste_manual, 0);
  const meDeben = debts.value
    .filter((d) => d.direccion === "me_deben")
    .reduce((acc, d) => acc + d.importe_total + d.ajuste_manual, 0);
  return { yoDebo, meDeben };
});

const monthLabel = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(now);
</script>

<template>
  <div class="mx-auto max-w-6xl">
    <header class="mb-4">
      <h1 class="text-xl font-bold tracking-tight font-display">Dashboard</h1>
      <p class="text-sm capitalize text-muted-foreground">{{ monthLabel }} · proyectado</p>
    </header>

    <div v-if="summaryError" class="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {{ summaryError }}
    </div>

    <section class="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconIngreso class="size-3.5" /> Ingresos del mes
        </div>
        <div class="num mt-1.5 text-2xl font-semibold text-pos">
          {{ summaryLoading ? "…" : formatMoney(summary?.ingresos ?? 0) }}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconEgreso class="size-3.5" /> Egresos del mes
        </div>
        <div class="num mt-1.5 text-2xl font-semibold text-neg">
          {{ summaryLoading ? "…" : formatMoney(summary?.egresos ?? 0) }}
        </div>
      </div>
      <div class="rounded-xl border border-border bg-card p-3.5">
        <div class="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconBalance class="size-3.5" /> Balance del mes
        </div>
        <div class="num mt-1.5 text-2xl font-semibold">
          {{ summaryLoading ? "…" : formatMoney(summary?.balance ?? 0) }}
        </div>
      </div>
    </section>

    <section class="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
      <RouterLink
        to="/balance"
        class="rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <IconBalance class="size-3.5" /> Balance {{ yearSummary?.year ?? year }}
        </div>
        <div v-if="yearError" class="text-sm text-destructive">{{ yearError }}</div>
        <div v-else class="grid grid-cols-3 gap-2 text-sm">
          <div>
            <div class="text-[11px] text-muted-foreground">Ingresos</div>
            <div class="num font-semibold text-pos">
              {{ yearLoading ? "…" : formatMoney(yearSummary?.ingresos ?? 0) }}
            </div>
          </div>
          <div>
            <div class="text-[11px] text-muted-foreground">Egresos</div>
            <div class="num font-semibold text-neg">
              {{ yearLoading ? "…" : formatMoney(yearSummary?.egresos ?? 0) }}
            </div>
          </div>
          <div>
            <div class="text-[11px] text-muted-foreground">Balance</div>
            <div class="num font-semibold">
              {{ yearLoading ? "…" : formatMoney(yearSummary?.balance ?? 0) }}
            </div>
          </div>
        </div>
      </RouterLink>

      <RouterLink
        to="/deudas"
        class="rounded-xl border border-border bg-card p-3.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div class="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <CreditCard class="size-3.5 text-primary" /> Deudas
        </div>
        <div v-if="debtsError" class="text-sm text-destructive">{{ debtsError }}</div>
        <div v-else class="grid grid-cols-2 gap-2 text-sm">
          <div>
            <div class="text-[11px] text-muted-foreground">Yo debo</div>
            <div class="num font-semibold text-neg">
              {{ debtsLoading ? "…" : formatMoney(debtTotals.yoDebo) }}
            </div>
          </div>
          <div>
            <div class="text-[11px] text-muted-foreground">Me deben</div>
            <div class="num font-semibold text-pos">
              {{ debtsLoading ? "…" : formatMoney(debtTotals.meDeben) }}
            </div>
          </div>
        </div>
      </RouterLink>
    </section>
  </div>
</template>
