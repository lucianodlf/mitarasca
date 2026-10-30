import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { NewTag } from "../db/schema.js";
import { type MovementsRepo, makeMovementsRepo } from "../movements/movements.repository.js";
import { type BalanceRepo, makeBalanceRepo } from "./balance.repository.js";

function seedTestTags(testDb: DbClient) {
  const insert = (data: NewTag) => {
    const row = testDb.insert(schema.tags).values(data).returning().all()[0];
    if (!row) throw new Error("Failed to insert seed tag");
    return row;
  };
  return {
    fijo: insert({ kind: "tipo", nombre: "Fijo", color: "#6366f1" }),
    variable: insert({ kind: "tipo", nombre: "Variable", color: "#f59e0b" }),
    excepcional: insert({ kind: "tipo", nombre: "Excepcional", color: "#a855f7" }),
    concepto: insert({ kind: "concepto", nombre: "Gas", color: "#f97316" }),
    conceptoSueldo: insert({ kind: "concepto", nombre: "Sueldo", color: "#34d399" }),
    pagado: insert({ kind: "estado", nombre: "Pagado", color: "#22c55e" }),
    adeudado: insert({ kind: "estado", nombre: "Adeudado", color: "#ef4444" }),
    deshabilitado: insert({ kind: "estado", nombre: "Deshabilitado", color: "#94a3b8" }),
    medioPago: insert({ kind: "medio_pago", nombre: "Tarjeta", color: "#999999" }),
    persona: insert({ kind: "persona", nombre: "Luciano", color: "#888888" }),
  };
}

let balanceRepo: BalanceRepo;
let movementsRepo: MovementsRepo;
let sqlite: Database;
let testDb: DbClient;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  balanceRepo = makeBalanceRepo(testDb);
  movementsRepo = makeMovementsRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("summarizeByYear", () => {
  test("suma correctamente ingresos/egresos/balance anuales con datos en ene-may 2026", () => {
    const { fijo, concepto, conceptoSueldo, pagado, adeudado } = seedTestTags(testDb);

    movementsRepo.createMovement(
      { fecha: "2026-01-05", direccion: "in", monto_total: 10000, detalle: "Sueldo enero" },
      [fijo.id, conceptoSueldo.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 2000, detalle: "Gas enero" },
      [fijo.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-02-05", direccion: "in", monto_total: 10000, detalle: "Sueldo febrero" },
      [fijo.id, conceptoSueldo.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-02-10", direccion: "out", monto_total: 2500, detalle: "Gas febrero" },
      [fijo.id, concepto.id, adeudado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-05-15", direccion: "out", monto_total: 1000, detalle: "Gas mayo" },
      [fijo.id, concepto.id, pagado.id]
    );

    const proyectado = balanceRepo.summarizeByYear(2026, "proyectado");
    expect(proyectado.ingresos).toBe(20000);
    expect(proyectado.egresos).toBe(5500);
    expect(proyectado.balance).toBe(14500);

    const real = balanceRepo.summarizeByYear(2026, "real");
    expect(real.ingresos).toBe(20000);
    expect(real.egresos).toBe(3000);
    expect(real.balance).toBe(17000);
  });

  test("meses sin movimientos devuelven ceros en months[] y no afectan el total", () => {
    const { fijo, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-03-10", direccion: "out", monto_total: 1000, detalle: "Gas marzo" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.summarizeByYear(2026, "proyectado");
    expect(result.months.length).toBe(12);
    for (let i = 1; i <= 12; i++) {
      const month = result.months[i - 1];
      expect(month?.month).toBe(i);
      if (i === 3) continue;
      expect(month).toEqual({ month: i, ingresos: 0, egresos: 0, balance: 0 });
    }
    expect(result.egresos).toBe(1000);
    expect(result.ingresos).toBe(0);
  });

  test("balance anual = ingresos anuales - egresos anuales", () => {
    const { fijo, concepto, conceptoSueldo, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-01-01", direccion: "in", monto_total: 5000, detalle: "Ingreso" },
      [fijo.id, conceptoSueldo.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-04-01", direccion: "out", monto_total: 1500, detalle: "Egreso" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.summarizeByYear(2026, "proyectado");
    expect(result.balance).toBe(result.ingresos - result.egresos);
  });

  test("modo real excluye movimientos en estado Adeudado del total anual", () => {
    const { fijo, concepto, pagado, adeudado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 1000, detalle: "Pagado enero" },
      [fijo.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-02-10", direccion: "out", monto_total: 2000, detalle: "Adeudado febrero" },
      [fijo.id, concepto.id, adeudado.id]
    );

    const proyectado = balanceRepo.summarizeByYear(2026, "proyectado");
    const real = balanceRepo.summarizeByYear(2026, "real");
    expect(proyectado.egresos).toBe(3000);
    expect(real.egresos).toBe(1000);
  });
});

describe("estimateVariableExpenses", () => {
  test("calcula el promedio solo sobre los meses (de los N) con al menos un gasto variable Pagado", () => {
    const { variable, concepto, pagado } = seedTestTags(testDb);

    // mes de referencia: 2026-06, n=6 -> meses considerados: 2026-01..2026-05 y 2025-12
    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 100, detalle: "Variable enero" },
      [variable.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-03-10", direccion: "out", monto_total: 200, detalle: "Variable marzo" },
      [variable.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-05-10", direccion: "out", monto_total: 300, detalle: "Variable mayo" },
      [variable.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.estimateVariableExpenses(2026, 6);
    expect(result.monthsConsidered).toBe(6);
    expect(result.validMonthsCount).toBe(3);
    expect(result.amount).toBe(round2((100 + 200 + 300) / 3));
    expect(result.monthlyAmounts).toEqual([
      { year: 2026, month: 1, total: 100 },
      { year: 2026, month: 3, total: 200 },
      { year: 2026, month: 5, total: 300 },
    ]);
  });

  test("movement con tag 'Variable' explícito y movement con tag tipo distinto de Fijo cuentan ambos como variable", () => {
    const { variable, excepcional, concepto, pagado } = seedTestTags(testDb);

    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 100, detalle: "Variable explícito" },
      [variable.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-02-10", direccion: "out", monto_total: 50, detalle: "Tipo no Fijo" },
      [excepcional.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.estimateVariableExpenses(2026, 6);
    expect(result.validMonthsCount).toBe(2);
    expect(result.monthlyAmounts).toEqual([
      { year: 2026, month: 1, total: 100 },
      { year: 2026, month: 2, total: 50 },
    ]);
  });

  test("excluye movements con tag tipo=Fijo aunque estén Pagados", () => {
    const { fijo, variable, concepto, pagado } = seedTestTags(testDb);

    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 5000, detalle: "Fijo enero" },
      [fijo.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-01-15", direccion: "out", monto_total: 100, detalle: "Variable enero" },
      [variable.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.estimateVariableExpenses(2026, 6);
    expect(result.monthlyAmounts).toEqual([{ year: 2026, month: 1, total: 100 }]);
  });

  test("excluye movements en estado Adeudado del cálculo, aunque sean variables", () => {
    const { variable, concepto, pagado, adeudado } = seedTestTags(testDb);

    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 100, detalle: "Variable pagado" },
      [variable.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-01-15", direccion: "out", monto_total: 9999, detalle: "Variable adeudado" },
      [variable.id, concepto.id, adeudado.id]
    );

    const result = balanceRepo.estimateVariableExpenses(2026, 6);
    expect(result.monthlyAmounts).toEqual([{ year: 2026, month: 1, total: 100 }]);
  });

  test("caso borde: cero meses con datos válidos", () => {
    const result = balanceRepo.estimateVariableExpenses(2026, 6);
    expect(result).toEqual({
      amount: 0,
      validMonthsCount: 0,
      monthsConsidered: 6,
      monthlyAmounts: [],
    });
  });

  test("respeta el parámetro n: con n=3 ignora meses fuera de la ventana", () => {
    const { variable, concepto, pagado } = seedTestTags(testDb);

    // mes de referencia 2026-06, n=3 -> considera 2026-03, 2026-04, 2026-05
    movementsRepo.createMovement(
      { fecha: "2026-02-10", direccion: "out", monto_total: 999, detalle: "Fuera de ventana" },
      [variable.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-04-10", direccion: "out", monto_total: 100, detalle: "Dentro de ventana" },
      [variable.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.estimateVariableExpenses(2026, 6, { n: 3 });
    expect(result.monthsConsidered).toBe(3);
    expect(result.validMonthsCount).toBe(1);
    expect(result.monthlyAmounts).toEqual([{ year: 2026, month: 4, total: 100 }]);
  });

  test("cruce de año: mes de referencia enero, n=6 considera jul-dic del año anterior", () => {
    const { variable, concepto, pagado } = seedTestTags(testDb);

    movementsRepo.createMovement(
      {
        fecha: "2025-12-10",
        direccion: "out",
        monto_total: 100,
        detalle: "Variable diciembre 2025",
      },
      [variable.id, concepto.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2025-07-10", direccion: "out", monto_total: 200, detalle: "Variable julio 2025" },
      [variable.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.estimateVariableExpenses(2026, 1);
    expect(result.validMonthsCount).toBe(2);
    expect(result.monthlyAmounts).toEqual([
      { year: 2025, month: 7, total: 200 },
      { year: 2025, month: 12, total: 100 },
    ]);
  });

  test("strategy distinta de 'average' lanza error", () => {
    expect(() =>
      balanceRepo.estimateVariableExpenses(2026, 6, {
        // biome-ignore lint/suspicious/noExplicitAny: forzar valor inválido para el test
        strategy: "weighted-average" as any,
      })
    ).toThrow();
  });
});

describe("getYearBalanceWithEstimate — switch incluir/excluir", () => {
  test("includeVariableEstimate=false es igual a summarizeByYear, sin estimatedVariable", () => {
    const { fijo, concepto, conceptoSueldo, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2026-01-05", direccion: "in", monto_total: 5000, detalle: "Sueldo" },
      [fijo.id, conceptoSueldo.id, pagado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-01-10", direccion: "out", monto_total: 1000, detalle: "Fijo" },
      [fijo.id, concepto.id, pagado.id]
    );

    const base = balanceRepo.summarizeByYear(2026, "proyectado");
    const result = balanceRepo.getYearBalanceWithEstimate(2026, "proyectado", {
      includeVariableEstimate: false,
    });

    expect(result.includesVariableEstimate).toBe(false);
    expect(result.ingresos).toBe(base.ingresos);
    expect(result.egresos).toBe(base.egresos);
    expect(result.balance).toBe(base.balance);
    expect(result.months).toEqual(base.months);
    for (const m of result.months) {
      expect(m.estimatedVariable).toBeUndefined();
    }
  });

  test("includeVariableEstimate=true en proyectado: rellena solo meses sin variables propios con la estimación histórica", () => {
    const { variable, fijo, concepto, pagado } = seedTestTags(testDb);

    // Histórico (2025-07 a 2025-12, n=6 para enero 2026): variable pagado de 100 cada mes
    for (const month of [7, 8, 9, 10, 11, 12]) {
      movementsRepo.createMovement(
        {
          fecha: `2025-${pad(month)}-10`,
          direccion: "out",
          monto_total: 100,
          detalle: `Variable 2025-${pad(month)}`,
        },
        [variable.id, concepto.id, pagado.id]
      );
    }

    // 2026-01: ya tiene su propio variable cargado -> no debe rellenarse
    movementsRepo.createMovement(
      { fecha: "2026-01-15", direccion: "out", monto_total: 50, detalle: "Variable propio enero" },
      [variable.id, concepto.id, pagado.id]
    );
    // 2026-02: solo tiene un Fijo -> no tiene variables propios, debe rellenarse
    movementsRepo.createMovement(
      { fecha: "2026-02-10", direccion: "out", monto_total: 2000, detalle: "Fijo febrero" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.getYearBalanceWithEstimate(2026, "proyectado", {
      includeVariableEstimate: true,
    });

    expect(result.includesVariableEstimate).toBe(true);

    const enero = result.months.find((m) => m.month === 1);
    const febrero = result.months.find((m) => m.month === 2);
    expect(enero?.estimatedVariable).toBeUndefined();
    expect(enero?.egresos).toBe(50);

    // estimación para febrero: promedio de los 6 meses anteriores (2025-08..2026-01)
    // 2025-08..2025-12 tienen 100 cada uno (5 meses), 2026-01 no tiene variable Pagado propio
    // (el de 2026-01 sí está Pagado y es variable, así que cuenta) -> 6 meses con 100 c/u
    const estimateForFebrero = balanceRepo.estimateVariableExpenses(2026, 2);
    expect(febrero?.estimatedVariable).toBe(estimateForFebrero.amount);
    expect(febrero?.egresos).toBe(round2(2000 + estimateForFebrero.amount));
  });

  test("mes cuyos únicos egresos variables están deshabilitados recibe estimación (no cuenta como con datos propios)", () => {
    const { variable, fijo, concepto, pagado, deshabilitado } = seedTestTags(testDb);

    for (const month of [7, 8, 9, 10, 11, 12]) {
      movementsRepo.createMovement(
        {
          fecha: `2025-${pad(month)}-10`,
          direccion: "out",
          monto_total: 100,
          detalle: `Variable 2025-${pad(month)}`,
        },
        [variable.id, concepto.id, pagado.id]
      );
    }

    // 2026-01: único variable está Deshabilitado -> no cuenta como "con datos propios", debe rellenarse
    movementsRepo.createMovement(
      {
        fecha: "2026-01-15",
        direccion: "out",
        monto_total: 99999,
        detalle: "Variable deshabilitado",
      },
      [variable.id, concepto.id, deshabilitado.id]
    );
    movementsRepo.createMovement(
      { fecha: "2026-01-20", direccion: "out", monto_total: 2000, detalle: "Fijo enero" },
      [fijo.id, concepto.id, pagado.id]
    );

    const result = balanceRepo.getYearBalanceWithEstimate(2026, "proyectado", {
      includeVariableEstimate: true,
    });

    const enero = result.months.find((m) => m.month === 1);
    expect(enero?.estimatedVariable).toBeDefined();
    expect(enero?.estimatedVariable).toBeGreaterThan(0);
  });

  test("includeVariableEstimate=true en modo real es ignorado", () => {
    const { variable, concepto, pagado } = seedTestTags(testDb);
    movementsRepo.createMovement(
      { fecha: "2025-12-10", direccion: "out", monto_total: 100, detalle: "Variable" },
      [variable.id, concepto.id, pagado.id]
    );

    const base = balanceRepo.summarizeByYear(2026, "real");
    const result = balanceRepo.getYearBalanceWithEstimate(2026, "real", {
      includeVariableEstimate: true,
    });

    expect(result.includesVariableEstimate).toBe(false);
    expect(result.egresos).toBe(base.egresos);
    expect(result.months).toEqual(base.months);
  });
});

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
