import type { DbClient } from "../db/client.js";
import type { MovementDirection, Tag } from "../db/schema.js";
import {
  ESTADO_DESHABILITADO,
  ESTADO_PAGADO,
  type MovementWithTags,
  makeMovementsRepo,
} from "../movements/movements.repository.js";

export type ReportMode = "proyectado" | "real";

export const SIN_CONCEPTO = "Sin concepto";

const MES_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

export type BuildFinancialReportOptions = {
  desde?: string;
  hasta?: string;
  modo?: ReportMode;
};

export type ReportMonth = { mes: string; ingresos: number; egresos: number; balance: number };

export type ReportConcept = {
  concepto: string;
  total: number;
  promedio_mensual: number;
  por_mes: Record<string, number>;
};

export type ReportConceptSide = { total: number; promedio_mensual: number };

export type ReportConceptSummary = {
  concepto: string;
  ingresos: ReportConceptSide;
  egresos: ReportConceptSide;
  neto_promedio_mensual: number;
};

export type ReportMovementRef = {
  id: number;
  fecha: string;
  detalle: string;
  direccion: MovementDirection;
  monto: number;
  conceptos: string[];
};

export type FinancialReport = {
  meta: {
    generado: string;
    moneda: "ARS";
    modo: ReportMode;
    desde: string | null;
    hasta: string | null;
    rango: "default" | "explicito";
    meses_evaluados: number;
    definiciones: Record<string, string>;
    reglas: Record<string, string>;
  };
  totales: { ingresos: number; egresos: number; balance: number };
  promedios_mensuales: { ingresos: number; egresos: number; balance: number };
  meses: ReportMonth[];
  conceptos: { ingresos: ReportConcept[]; egresos: ReportConcept[] };
  conceptos_resumen: ReportConceptSummary[];
  advertencias: { sin_concepto: ReportMovementRef[]; multi_concepto: ReportMovementRef[] };
};

export interface ReportRepo {
  buildFinancialReport(options?: BuildFinancialReportOptions): FinancialReport;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function validateMes(label: string, value: string): void {
  if (!MES_REGEX.test(value)) {
    throw new Error(`${label} inválido: "${value}" (esperado YYYY-MM)`);
  }
}

function monthsBetween(desde: string, hasta: string): string[] {
  const result: string[] = [];
  let year = Number(desde.slice(0, 4));
  let month = Number(desde.slice(5, 7));
  const endYear = Number(hasta.slice(0, 4));
  const endMonth = Number(hasta.slice(5, 7));
  while (year < endYear || (year === endYear && month <= endMonth)) {
    result.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return result;
}

function countsInMode(tagList: Tag[], modo: ReportMode): boolean {
  const estados = tagList.filter((t) => t.kind === "estado").map((t) => t.nombre);
  if (modo === "real") return estados.includes(ESTADO_PAGADO);
  return !estados.includes(ESTADO_DESHABILITADO);
}

function toRef(m: MovementWithTags, conceptos: string[]): ReportMovementRef {
  return {
    id: m.id,
    fecha: m.fecha,
    detalle: m.detalle,
    direccion: m.direccion,
    monto: m.monto_efectivo,
    conceptos,
  };
}

const DEFINICIONES: Record<string, string> = {
  ingresos: "Suma de monto_efectivo de movimientos con direccion 'in'.",
  egresos: "Suma de monto_efectivo de movimientos con direccion 'out'.",
  balance: "ingresos - egresos.",
  monto_efectivo: "Monto con la regla de division/multiplicacion ya aplicada (parte propia).",
  concepto: "Clasificacion por tag de kind 'concepto'.",
  promedio_mensual: "total / meses_evaluados.",
};

export function makeReportRepo(db: DbClient): ReportRepo {
  const movementsRepo = makeMovementsRepo(db);

  return {
    buildFinancialReport(options: BuildFinancialReportOptions = {}): FinancialReport {
      const modo = options.modo ?? "real";
      if (modo !== "real" && modo !== "proyectado") {
        throw new Error(`modo inválido: "${modo}" (esperado real|proyectado)`);
      }
      if (options.desde !== undefined) validateMes("desde", options.desde);
      if (options.hasta !== undefined) validateMes("hasta", options.hasta);
      if (
        options.desde !== undefined &&
        options.hasta !== undefined &&
        options.desde > options.hasta
      ) {
        throw new Error(
          `desde (${options.desde}) no puede ser posterior a hasta (${options.hasta})`
        );
      }

      const from = options.desde ? `${options.desde}-01` : "0000-01-01";
      const to = options.hasta ? `${options.hasta}-31` : "9999-12-31";
      const counted = movementsRepo
        .listMovementsByDateRange(from, to)
        .filter((m) => countsInMode(m.tags, modo));

      const dataMonths = counted.map((m) => m.fecha.slice(0, 7)).sort();
      const first = dataMonths[0];
      const last = dataMonths[dataMonths.length - 1];
      const start = options.desde ?? first;
      const end = options.hasta ?? last;
      const meses = start !== undefined && end !== undefined ? monthsBetween(start, end) : [];
      const n = meses.length;

      const monthTotals = new Map<string, { in: number; out: number }>();
      for (const mes of meses) monthTotals.set(mes, { in: 0, out: 0 });
      const concepts: Record<MovementDirection, Map<string, Map<string, number>>> = {
        in: new Map(),
        out: new Map(),
      };
      const sinConcepto: ReportMovementRef[] = [];
      const multiConcepto: ReportMovementRef[] = [];

      for (const m of counted) {
        const mes = m.fecha.slice(0, 7);
        const totals = monthTotals.get(mes);
        if (!totals) continue;
        totals[m.direccion] += m.monto_efectivo;

        const nombres = m.tags.filter((t) => t.kind === "concepto").map((t) => t.nombre);
        if (nombres.length === 0) sinConcepto.push(toRef(m, []));
        if (nombres.length > 1) multiConcepto.push(toRef(m, nombres));

        const buckets = nombres.length === 0 ? [SIN_CONCEPTO] : nombres;
        const share = m.monto_efectivo / buckets.length;
        const byConcept = concepts[m.direccion];
        for (const nombre of buckets) {
          const perMonth = byConcept.get(nombre) ?? new Map<string, number>();
          perMonth.set(mes, (perMonth.get(mes) ?? 0) + share);
          byConcept.set(nombre, perMonth);
        }
      }

      const avg = (total: number): number => (n === 0 ? 0 : round2(total / n));

      const buildConcepts = (direccion: MovementDirection): ReportConcept[] =>
        [...concepts[direccion].entries()]
          .map(([concepto, perMonth]) => {
            const total = [...perMonth.values()].reduce((acc, v) => acc + v, 0);
            const por_mes: Record<string, number> = {};
            for (const mes of meses) {
              const v = perMonth.get(mes);
              if (v !== undefined) por_mes[mes] = round2(v);
            }
            return { concepto, total: round2(total), promedio_mensual: avg(total), por_mes };
          })
          .sort((a, b) => b.total - a.total || a.concepto.localeCompare(b.concepto));

      const sideOf = (direccion: MovementDirection, concepto: string) => {
        const perMonth = concepts[direccion].get(concepto);
        const total = perMonth ? [...perMonth.values()].reduce((acc, v) => acc + v, 0) : 0;
        return { total, side: { total: round2(total), promedio_mensual: avg(total) } };
      };
      const nombresConcepto = new Set([...concepts.in.keys(), ...concepts.out.keys()]);
      const conceptosResumen: ReportConceptSummary[] = [...nombresConcepto]
        .map((concepto) => {
          const inn = sideOf("in", concepto);
          const out = sideOf("out", concepto);
          return {
            concepto,
            ingresos: inn.side,
            egresos: out.side,
            neto_promedio_mensual: avg(inn.total - out.total),
          };
        })
        .sort(
          (a, b) =>
            b.egresos.total + b.ingresos.total - (a.egresos.total + a.ingresos.total) ||
            a.concepto.localeCompare(b.concepto)
        );

      const mesesOut: ReportMonth[] = meses.map((mes) => {
        const t = monthTotals.get(mes) ?? { in: 0, out: 0 };
        return {
          mes,
          ingresos: round2(t.in),
          egresos: round2(t.out),
          balance: round2(t.in - t.out),
        };
      });

      let totalIn = 0;
      let totalOut = 0;
      for (const t of monthTotals.values()) {
        totalIn += t.in;
        totalOut += t.out;
      }

      return {
        meta: {
          generado: new Date().toISOString(),
          moneda: "ARS",
          modo,
          desde: start ?? null,
          hasta: end ?? null,
          rango:
            options.desde !== undefined || options.hasta !== undefined ? "explicito" : "default",
          meses_evaluados: n,
          definiciones: DEFINICIONES,
          reglas: {
            modo:
              modo === "real"
                ? "real: solo movimientos con estado Pagado."
                : "proyectado: todos los movimientos salvo estado Deshabilitado.",
            rango:
              "Sin desde/hasta: del primer al ultimo mes con movimientos en el modo. Meses intermedios sin datos cuentan con 0.",
            promedio: "total / meses_evaluados, incluyendo meses en 0.",
            multi_concepto: "Movimiento con varios conceptos: monto repartido en partes iguales.",
            sin_concepto: `Movimiento sin concepto: se acumula en '${SIN_CONCEPTO}'.`,
            por_mes: "Los meses sin movimientos del concepto se omiten (equivalen a 0).",
            redondeo:
              "2 decimales al emitir; la suma de conceptos puede diferir del total por centavos.",
          },
        },
        totales: {
          ingresos: round2(totalIn),
          egresos: round2(totalOut),
          balance: round2(totalIn - totalOut),
        },
        promedios_mensuales: {
          ingresos: avg(totalIn),
          egresos: avg(totalOut),
          balance: avg(totalIn - totalOut),
        },
        meses: mesesOut,
        conceptos: { ingresos: buildConcepts("in"), egresos: buildConcepts("out") },
        conceptos_resumen: conceptosResumen,
        advertencias: { sin_concepto: sinConcepto, multi_concepto: multiConcepto },
      };
    },
  };
}

function mdRow(cells: (string | number)[]): string {
  return `| ${cells.join(" | ")} |`;
}

function mdTable(headers: string[], rows: (string | number)[][]): string {
  return [mdRow(headers), mdRow(headers.map(() => "---")), ...rows.map(mdRow)].join("\n");
}

export function renderReportMarkdown(report: FinancialReport): string {
  const { meta, totales, promedios_mensuales: prom, meses } = report;
  const lines: string[] = [
    "# Informe financiero",
    "",
    `- Modo: ${meta.modo} | Rango: ${meta.desde ?? "-"} a ${meta.hasta ?? "-"} (${meta.rango}) | Meses evaluados: ${meta.meses_evaluados} | Moneda: ${meta.moneda}`,
    ...Object.entries(meta.reglas).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "## Resumen mensual",
    "",
    mdTable(
      ["Mes", "Ingresos", "Egresos", "Balance"],
      [
        ...meses.map((m) => [m.mes, m.ingresos, m.egresos, m.balance]),
        ["Total", totales.ingresos, totales.egresos, totales.balance],
        ["Promedio", prom.ingresos, prom.egresos, prom.balance],
      ]
    ),
  ];

  const section = (title: string, list: ReportConcept[]) => {
    if (list.length === 0) return;
    const headers = ["Concepto", ...meses.map((m) => m.mes), "Total", "Promedio"];
    const rows = list.map((c) => [
      c.concepto,
      ...meses.map((m) => c.por_mes[m.mes] ?? 0),
      c.total,
      c.promedio_mensual,
    ]);
    lines.push("", `## ${title}`, "", mdTable(headers, rows));
  };
  section("Ingresos por concepto", report.conceptos.ingresos);
  section("Egresos por concepto", report.conceptos.egresos);

  if (report.conceptos_resumen.length > 0) {
    lines.push(
      "",
      "## Resumen por concepto (promedios mensuales)",
      "",
      mdTable(
        [
          "Concepto",
          "Ingresos total",
          "Ingresos prom.",
          "Egresos total",
          "Egresos prom.",
          "Neto prom.",
        ],
        report.conceptos_resumen.map((c) => [
          c.concepto,
          c.ingresos.total,
          c.ingresos.promedio_mensual,
          c.egresos.total,
          c.egresos.promedio_mensual,
          c.neto_promedio_mensual,
        ])
      )
    );
  }

  const warn = (title: string, list: ReportMovementRef[]) => {
    if (list.length === 0) return;
    lines.push("", `## ${title}`, "");
    for (const r of list) {
      lines.push(
        `- #${r.id} ${r.fecha} ${r.direccion} ${r.monto} "${r.detalle}"${r.conceptos.length ? ` [${r.conceptos.join(", ")}]` : ""}`
      );
    }
  };
  warn("Movimientos sin concepto", report.advertencias.sin_concepto);
  warn("Movimientos con varios conceptos", report.advertencias.multi_concepto);

  return `${lines.join("\n")}\n`;
}
