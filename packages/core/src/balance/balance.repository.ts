import { and, eq, gte, lte } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { movement_tags, movements, tags } from "../db/schema.js";
import {
  ESTADO_DESHABILITADO,
  type SummarizeResult,
  loadTagsForMovements,
  makeMovementsRepo,
} from "../movements/movements.repository.js";

const TAG_TIPO_FIJO = "Fijo";
const ESTADO_PAGADO = "Pagado";
const DEFAULT_N = 6;

export type MonthSummary = SummarizeResult & { month: number };

export type YearSummary = {
  year: number;
  mode: "proyectado" | "real";
  ingresos: number;
  egresos: number;
  balance: number;
  months: MonthSummary[];
};

export type EstimationStrategy = "average";

export type EstimateVariableExpensesOptions = {
  n?: number;
  strategy?: EstimationStrategy;
};

export type VariableExpenseEstimate = {
  amount: number;
  validMonthsCount: number;
  monthsConsidered: number;
  monthlyAmounts: Array<{ year: number; month: number; total: number }>;
};

export type MonthSummaryWithEstimate = MonthSummary & { estimatedVariable?: number };

export type YearSummaryWithEstimate = Omit<YearSummary, "months"> & {
  months: MonthSummaryWithEstimate[];
  includesVariableEstimate: boolean;
};

export type GetYearBalanceWithEstimateOptions = {
  includeVariableEstimate?: boolean;
  estimateOptions?: EstimateVariableExpensesOptions;
};

export interface BalanceRepo {
  summarizeByYear(year: number, mode: "proyectado" | "real"): YearSummary;
  estimateVariableExpenses(
    year: number,
    month: number,
    options?: EstimateVariableExpensesOptions
  ): VariableExpenseEstimate;
  getYearBalanceWithEstimate(
    year: number,
    mode: "proyectado" | "real",
    options?: GetYearBalanceWithEstimateOptions
  ): YearSummaryWithEstimate;
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

function previousMonths(
  year: number,
  month: number,
  n: number
): Array<{ year: number; month: number }> {
  const result: Array<{ year: number; month: number }> = [];
  let y = year;
  let m = month;
  for (let i = 0; i < n; i++) {
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
    result.push({ year: y, month: m });
  }
  return result;
}

function isVariableMovement(movementTags: { kind: string; nombre: string }[]): boolean {
  return !movementTags.some((t) => t.kind === "tipo" && t.nombre === TAG_TIPO_FIJO);
}

function isDeshabilitado(movementTags: { kind: string; nombre: string }[]): boolean {
  return movementTags.some((t) => t.kind === "estado" && t.nombre === ESTADO_DESHABILITADO);
}

export function makeBalanceRepo(db: DbClient): BalanceRepo {
  const movementsRepo = makeMovementsRepo(db);

  function monthHasOwnVariableMovements(year: number, month: number): boolean {
    const { from, to } = monthDateRange(year, month);
    const rows = db
      .select({ movement: movements })
      .from(movements)
      .where(
        and(eq(movements.direccion, "out"), gte(movements.fecha, from), lte(movements.fecha, to))
      )
      .all()
      .map((r) => r.movement);

    if (rows.length === 0) return false;

    const tagMap = loadTagsForMovements(
      db,
      rows.map((m) => m.id)
    );

    return rows.some((m) => {
      const movementTags = tagMap.get(m.id) ?? [];
      return isVariableMovement(movementTags) && !isDeshabilitado(movementTags);
    });
  }

  return {
    summarizeByYear(year: number, mode: "proyectado" | "real"): YearSummary {
      const months: MonthSummary[] = [];
      for (let m = 1; m <= 12; m++) {
        months.push({ month: m, ...movementsRepo.summarizeByMonth(year, m, mode) });
      }

      const ingresos = round2(months.reduce((acc, m) => acc + m.ingresos, 0));
      const egresos = round2(months.reduce((acc, m) => acc + m.egresos, 0));
      const balance = round2(ingresos - egresos);

      return { year, mode, ingresos, egresos, balance, months };
    },

    estimateVariableExpenses(
      year: number,
      month: number,
      options?: EstimateVariableExpensesOptions
    ): VariableExpenseEstimate {
      const n = options?.n ?? DEFAULT_N;
      const strategy = options?.strategy ?? "average";
      if (strategy !== "average") {
        throw new Error(`Estrategia de estimación no soportada: "${strategy}"`);
      }

      const months = previousMonths(year, month, n);
      const sorted = [...months].sort((a, b) => a.year - b.year || a.month - b.month);
      const oldest = sorted[0];
      const newest = sorted[sorted.length - 1];
      if (!oldest || !newest) {
        return { amount: 0, validMonthsCount: 0, monthsConsidered: n, monthlyAmounts: [] };
      }

      const { from } = monthDateRange(oldest.year, oldest.month);
      const { to } = monthDateRange(newest.year, newest.month);

      const candidateMovements = db
        .select({ movement: movements })
        .from(movements)
        .innerJoin(movement_tags, eq(movements.id, movement_tags.movement_id))
        .innerJoin(tags, eq(movement_tags.tag_id, tags.id))
        .where(
          and(
            eq(movements.direccion, "out"),
            eq(tags.kind, "estado"),
            eq(tags.nombre, ESTADO_PAGADO),
            gte(movements.fecha, from),
            lte(movements.fecha, to)
          )
        )
        .all()
        .map((r) => r.movement);

      const tagMap = loadTagsForMovements(
        db,
        candidateMovements.map((m) => m.id)
      );

      const byMonth = new Map<string, number>();
      for (const m of candidateMovements) {
        if (!isVariableMovement(tagMap.get(m.id) ?? [])) continue;
        const key = m.fecha.slice(0, 7);
        byMonth.set(key, round2((byMonth.get(key) ?? 0) + m.monto_efectivo));
      }

      const monthlyAmounts = sorted
        .map(({ year: y, month: mo }) => ({
          year: y,
          month: mo,
          total: byMonth.get(`${y}-${pad(mo)}`) ?? 0,
        }))
        .filter(({ total }) => total > 0);

      const validMonthsCount = monthlyAmounts.length;
      const amount =
        validMonthsCount === 0
          ? 0
          : round2(monthlyAmounts.reduce((acc, x) => acc + x.total, 0) / validMonthsCount);

      return { amount, validMonthsCount, monthsConsidered: n, monthlyAmounts };
    },

    getYearBalanceWithEstimate(
      year: number,
      mode: "proyectado" | "real",
      options?: GetYearBalanceWithEstimateOptions
    ): YearSummaryWithEstimate {
      const base = this.summarizeByYear(year, mode);
      const include = (options?.includeVariableEstimate ?? false) && mode === "proyectado";

      if (!include) {
        return { ...base, includesVariableEstimate: false };
      }

      let extraTotal = 0;
      const months: MonthSummaryWithEstimate[] = base.months.map((m) => {
        if (monthHasOwnVariableMovements(year, m.month)) return { ...m };

        const est = this.estimateVariableExpenses(year, m.month, options?.estimateOptions);
        extraTotal = round2(extraTotal + est.amount);
        const egresos = round2(m.egresos + est.amount);
        const balance = round2(m.ingresos - egresos);
        return { ...m, egresos, balance, estimatedVariable: est.amount };
      });

      const egresos = round2(base.egresos + extraTotal);
      const balance = round2(base.ingresos - egresos);

      return {
        year,
        mode,
        ingresos: base.ingresos,
        egresos,
        balance,
        months,
        includesVariableEstimate: true,
      };
    },
  };
}
