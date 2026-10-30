import { trpc } from "@/lib/trpc";
import { ref, watch } from "vue";

type BalanceMode = "proyectado" | "real";

export type MonthSummaryWithEstimate = {
  month: number;
  ingresos: number;
  egresos: number;
  balance: number;
  estimatedVariable?: number;
};

export type YearSummaryWithEstimate = {
  year: number;
  mode: BalanceMode;
  ingresos: number;
  egresos: number;
  balance: number;
  months: MonthSummaryWithEstimate[];
  includesVariableEstimate: boolean;
};

/** Balance anual proyectado/real, con estimación opcional de gastos variables. */
export function useBalance() {
  const now = new Date();
  const year = ref(now.getFullYear());
  const mode = ref<BalanceMode>("proyectado");
  const includeVariableEstimate = ref(false);

  const summary = ref<YearSummaryWithEstimate | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);

  async function refetch() {
    loading.value = true;
    error.value = null;
    try {
      summary.value = await trpc.balance.getYearWithEstimate.query({
        year: year.value,
        mode: mode.value,
        includeVariableEstimate: includeVariableEstimate.value,
      });
    } catch (e) {
      error.value = e instanceof Error ? e.message : "Error al cargar el balance";
    } finally {
      loading.value = false;
    }
  }

  function shiftYear(delta: number) {
    year.value += delta;
  }

  watch([year, mode, includeVariableEstimate], refetch, { immediate: true });

  return { year, mode, includeVariableEstimate, summary, loading, error, refetch, shiftYear };
}
