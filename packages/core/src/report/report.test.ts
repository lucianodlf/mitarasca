import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { NewTag } from "../db/schema.js";
import { type MovementsRepo, makeMovementsRepo } from "../movements/movements.repository.js";
import { type ReportRepo, makeReportRepo, renderReportMarkdown } from "./report.repository.js";

function seedTestTags(testDb: DbClient) {
  const insert = (data: NewTag) => {
    const row = testDb.insert(schema.tags).values(data).returning().all()[0];
    if (!row) throw new Error("Failed to insert seed tag");
    return row;
  };
  return {
    fijo: insert({ kind: "tipo", nombre: "Fijo", color: "#6366f1" }),
    gas: insert({ kind: "concepto", nombre: "Gas", color: "#f97316" }),
    super: insert({ kind: "concepto", nombre: "Super", color: "#f59e0b" }),
    sueldo: insert({ kind: "concepto", nombre: "Sueldo", color: "#34d399" }),
    pagado: insert({ kind: "estado", nombre: "Pagado", color: "#22c55e" }),
    adeudado: insert({ kind: "estado", nombre: "Adeudado", color: "#ef4444" }),
    deshabilitado: insert({ kind: "estado", nombre: "Deshabilitado", color: "#94a3b8" }),
  };
}

let reportRepo: ReportRepo;
let movementsRepo: MovementsRepo;
let sqlite: Database;
let testDb: DbClient;
let t: ReturnType<typeof seedTestTags>;

function add(fecha: string, direccion: "in" | "out", monto: number, tagIds: number[]) {
  movementsRepo.createMovement(
    { fecha, direccion, monto_total: monto, detalle: `m ${fecha}` },
    tagIds
  );
}

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  reportRepo = makeReportRepo(testDb);
  movementsRepo = makeMovementsRepo(testDb);
  t = seedTestTags(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("buildFinancialReport", () => {
  test("totales por mes, por concepto, promedios y meses evaluados", () => {
    add("2026-01-05", "in", 10000, [t.fijo.id, t.sueldo.id, t.pagado.id]);
    add("2026-01-10", "out", 2000, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-02-05", "in", 12000, [t.fijo.id, t.sueldo.id, t.pagado.id]);
    add("2026-02-10", "out", 3000, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-02-12", "out", 1000, [t.fijo.id, t.super.id, t.pagado.id]);

    const r = reportRepo.buildFinancialReport();

    expect(r.meta.meses_evaluados).toBe(2);
    expect(r.meta.rango).toBe("default");
    expect(r.meta.modo).toBe("real");
    expect(r.meses).toEqual([
      { mes: "2026-01", ingresos: 10000, egresos: 2000, balance: 8000 },
      { mes: "2026-02", ingresos: 12000, egresos: 4000, balance: 8000 },
    ]);
    expect(r.totales).toEqual({ ingresos: 22000, egresos: 6000, balance: 16000 });
    expect(r.promedios_mensuales).toEqual({ ingresos: 11000, egresos: 3000, balance: 8000 });

    const gas = r.conceptos.egresos.find((c) => c.concepto === "Gas");
    expect(gas).toEqual({
      concepto: "Gas",
      total: 5000,
      promedio_mensual: 2500,
      por_mes: { "2026-01": 2000, "2026-02": 3000 },
    });
    const sup = r.conceptos.egresos.find((c) => c.concepto === "Super");
    expect(sup?.por_mes).toEqual({ "2026-02": 1000 });
    expect(sup?.promedio_mensual).toBe(500);
    expect(r.conceptos.egresos[0]?.concepto).toBe("Gas");
    expect(r.conceptos.ingresos[0]?.total).toBe(22000);
  });

  test("conceptos_resumen une ambas direcciones por concepto", () => {
    add("2026-01-05", "in", 900, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-01-06", "out", 300, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-02-06", "out", 100, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-02-07", "in", 500, [t.fijo.id, t.sueldo.id, t.pagado.id]);

    const r = reportRepo.buildFinancialReport();
    const gas = r.conceptos_resumen.find((c) => c.concepto === "Gas");
    expect(gas).toEqual({
      concepto: "Gas",
      ingresos: { total: 900, promedio_mensual: 450 },
      egresos: { total: 400, promedio_mensual: 200 },
      neto_promedio_mensual: 250,
    });
    const sueldo = r.conceptos_resumen.find((c) => c.concepto === "Sueldo");
    expect(sueldo?.egresos).toEqual({ total: 0, promedio_mensual: 0 });
    expect(r.conceptos_resumen).toHaveLength(2);
  });

  test("modo real excluye no pagados; proyectado incluye adeudado y excluye deshabilitado", () => {
    add("2026-01-05", "out", 1000, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-01-06", "out", 500, [t.fijo.id, t.gas.id, t.adeudado.id]);
    add("2026-01-07", "out", 300, [t.fijo.id, t.gas.id, t.deshabilitado.id]);

    expect(reportRepo.buildFinancialReport({ modo: "real" }).totales.egresos).toBe(1000);
    expect(reportRepo.buildFinancialReport({ modo: "proyectado" }).totales.egresos).toBe(1500);
  });

  test("multi-concepto reparte en partes iguales y sin concepto va al bucket", () => {
    add("2026-01-05", "out", 1000, [t.fijo.id, t.gas.id, t.super.id, t.pagado.id]);
    add("2026-01-06", "in", 700, [t.fijo.id, t.pagado.id]);

    const r = reportRepo.buildFinancialReport();

    expect(r.meses[0]?.egresos).toBe(1000);
    expect(r.conceptos.egresos.map((c) => [c.concepto, c.total]).sort()).toEqual([
      ["Gas", 500],
      ["Super", 500],
    ]);
    expect(r.conceptos.ingresos).toEqual([
      { concepto: "Sin concepto", total: 700, promedio_mensual: 700, por_mes: { "2026-01": 700 } },
    ]);
    expect(r.advertencias.sin_concepto).toHaveLength(1);
    expect(r.advertencias.sin_concepto[0]?.monto).toBe(700);
    expect(r.advertencias.multi_concepto[0]?.conceptos.sort()).toEqual(["Gas", "Super"]);
  });

  test("rango explicito con meses vacios: promedios incluyen ceros", () => {
    add("2026-01-05", "out", 600, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-03-05", "out", 300, [t.fijo.id, t.gas.id, t.pagado.id]);

    const r = reportRepo.buildFinancialReport({ desde: "2026-01", hasta: "2026-03" });

    expect(r.meta.rango).toBe("explicito");
    expect(r.meta.meses_evaluados).toBe(3);
    expect(r.meses.map((m) => m.egresos)).toEqual([600, 0, 300]);
    expect(r.promedios_mensuales.egresos).toBe(300);
    expect(r.conceptos.egresos[0]?.por_mes).toEqual({ "2026-01": 600, "2026-03": 300 });
  });

  test("rango default entre primer y ultimo mes con datos; filtros acotan", () => {
    add("2026-01-05", "out", 100, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-02-05", "out", 200, [t.fijo.id, t.gas.id, t.adeudado.id]);
    add("2026-03-05", "out", 400, [t.fijo.id, t.gas.id, t.pagado.id]);

    const real = reportRepo.buildFinancialReport();
    expect(real.meta.desde).toBe("2026-01");
    expect(real.meta.hasta).toBe("2026-03");
    expect(real.meta.meses_evaluados).toBe(3);

    const acotado = reportRepo.buildFinancialReport({ desde: "2026-03" });
    expect(acotado.meta.meses_evaluados).toBe(1);
    expect(acotado.totales.egresos).toBe(400);
  });

  test("sin datos devuelve informe vacio con 0 meses", () => {
    const r = reportRepo.buildFinancialReport();
    expect(r.meta.meses_evaluados).toBe(0);
    expect(r.meses).toEqual([]);
    expect(r.promedios_mensuales).toEqual({ ingresos: 0, egresos: 0, balance: 0 });
  });

  test("valida formato y orden del rango", () => {
    expect(() => reportRepo.buildFinancialReport({ desde: "2026-13" })).toThrow("desde inválido");
    expect(() => reportRepo.buildFinancialReport({ hasta: "26-01" })).toThrow("hasta inválido");
    expect(() => reportRepo.buildFinancialReport({ desde: "2026-05", hasta: "2026-01" })).toThrow(
      "no puede ser posterior"
    );
  });
});

describe("renderReportMarkdown", () => {
  test("incluye resumen mensual, conceptos y advertencias", () => {
    add("2026-01-05", "out", 1000, [t.fijo.id, t.gas.id, t.pagado.id]);
    add("2026-01-06", "in", 700, [t.fijo.id, t.pagado.id]);

    const md = renderReportMarkdown(reportRepo.buildFinancialReport());

    expect(md).toContain("## Resumen mensual");
    expect(md).toContain("| 2026-01 | 700 | 1000 | -300 |");
    expect(md).toContain("## Egresos por concepto");
    expect(md).toContain("| Gas | 1000 | 1000 | 1000 |");
    expect(md).toContain("## Movimientos sin concepto");
  });
});
