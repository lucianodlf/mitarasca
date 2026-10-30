import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { DbClient } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { NewTag } from "../db/schema.js";
import { type MovementsRepo, makeMovementsRepo } from "../movements/movements.repository.js";
import { type DebtsRepo, makeDebtsRepo } from "./debts.repository.js";
import { type InstallmentsRepo, makeInstallmentsRepo } from "./installments.repository.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function seedTestTags(testDb: DbClient) {
  const insert = (data: NewTag) => {
    const row = testDb.insert(schema.tags).values(data).returning().all()[0];
    if (!row) throw new Error("Failed to insert seed tag");
    return row;
  };
  return {
    tarjetaMP: insert({ kind: "medio_pago", nombre: "Tarjeta MP", color: "#0ea5e9" }),
    efectivo: insert({ kind: "medio_pago", nombre: "Efectivo", color: "#10b981" }),
    tia: insert({ kind: "persona", nombre: "Tia", color: "#f472b6" }),
    ana: insert({ kind: "persona", nombre: "Ana", color: "#a78bfa" }),
    beto: insert({ kind: "persona", nombre: "Beto", color: "#fb923c" }),
    tipoFijo: insert({ kind: "tipo", nombre: "Fijo", color: "#6366f1" }),
    tipoVariable: insert({ kind: "tipo", nombre: "Variable", color: "#f59e0b" }),
    concepto: insert({ kind: "concepto", nombre: "Gas", color: "#f97316" }),
    pagado: insert({ kind: "estado", nombre: "Pagado", color: "#22c55e" }),
    adeudado: insert({ kind: "estado", nombre: "Adeudado", color: "#ef4444" }),
  };
}

let repo: DebtsRepo;
let installmentsRepo: InstallmentsRepo;
let movementsRepo: MovementsRepo;
let sqlite: Database;
let testDb: DbClient;

beforeEach(() => {
  sqlite = new Database(":memory:");
  testDb = drizzle(sqlite, { schema });
  migrate(testDb, { migrationsFolder: "./drizzle" });
  repo = makeDebtsRepo(testDb);
  installmentsRepo = makeInstallmentsRepo(testDb);
  movementsRepo = makeMovementsRepo(testDb);
});

afterEach(() => {
  sqlite.close();
});

describe("Debt CRUD", () => {
  test("crea una deuda yo_debo con medio de pago y una persona, y la recupera por id", () => {
    const { tarjetaMP, beto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    expect(debt.id).toBeGreaterThan(0);
    expect(debt.direccion).toBe("yo_debo");
    expect(debt.medioPago?.nombre).toBe("Tarjeta MP");
    expect(debt.persona?.nombre).toBe("Beto");

    const found = repo.getDebtById(debt.id);
    expect(found).toBeDefined();
    expect(found?.descripcion).toBe("Gatos Beto");
    expect(found?.medioPago?.nombre).toBe("Tarjeta MP");
    expect(found?.persona?.nombre).toBe("Beto");
  });

  test("crea una deuda me_deben con una persona", () => {
    const { tarjetaMP, tia } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Regalo Tia - Mate",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: tia.id,
      importe_total: 15916 * 3,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    expect(debt.direccion).toBe("me_deben");
    expect(debt.persona?.nombre).toBe("Tia");
  });

  test("rechaza si medio_pago_tag_id apunta a un tag de kind incorrecto", () => {
    const { tipoFijo, beto } = seedTestTags(testDb);
    expect(() =>
      repo.createDebt({
        descripcion: "Inválida",
        direccion: "yo_debo",
        medio_pago_tag_id: tipoFijo.id,
        persona_tag_id: beto.id,
        importe_total: 1000,
        cant_cuotas: 1,
        fecha: "2026-01-10",
        fecha_inicio: "2026-01-10",
      })
    ).toThrow();
  });

  test("rechaza si persona_tag_id apunta a un tag de kind incorrecto", () => {
    const { tarjetaMP, concepto } = seedTestTags(testDb);
    expect(() =>
      repo.createDebt({
        descripcion: "Inválida",
        direccion: "yo_debo",
        medio_pago_tag_id: tarjetaMP.id,
        persona_tag_id: concepto.id,
        importe_total: 1000,
        cant_cuotas: 1,
        fecha: "2026-01-10",
        fecha_inicio: "2026-01-10",
      })
    ).toThrow();
  });

  test("rechaza importe_total <= 0 o cant_cuotas < 1", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    expect(() =>
      repo.createDebt({
        descripcion: "Inválida",
        direccion: "yo_debo",
        medio_pago_tag_id: tarjetaMP.id,
        importe_total: 0,
        cant_cuotas: 1,
        fecha: "2026-01-10",
        fecha_inicio: "2026-01-10",
      })
    ).toThrow();
    expect(() =>
      repo.createDebt({
        descripcion: "Inválida",
        direccion: "yo_debo",
        medio_pago_tag_id: tarjetaMP.id,
        importe_total: 1000,
        cant_cuotas: 0,
        fecha: "2026-01-10",
        fecha_inicio: "2026-01-10",
      })
    ).toThrow();
  });

  test("listDebts filtra por dirección", () => {
    const { tarjetaMP, beto, tia } = seedTestTags(testDb);
    repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    repo.createDebt({
      descripcion: "Regalo Tia",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: tia.id,
      importe_total: 15916,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const yoDebo = repo.listDebts("yo_debo");
    const meDeben = repo.listDebts("me_deben");
    const all = repo.listDebts();

    expect(yoDebo.length).toBe(1);
    expect(yoDebo[0]?.descripcion).toBe("Gatos Beto");
    expect(meDeben.length).toBe(1);
    expect(meDeben[0]?.descripcion).toBe("Regalo Tia");
    expect(all.length).toBe(2);
  });

  test("updateDebt reemplaza persona y actualiza campos sin regenerar cuotas", () => {
    const { tarjetaMP, efectivo, beto, tia } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Original",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 1000,
      cant_cuotas: 2,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const idsAntes = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .map((i) => i.id)
      .sort();

    const updated = repo.updateDebt(debt.id, {
      descripcion: "Actualizada",
      medio_pago_tag_id: efectivo.id,
      persona_tag_id: tia.id,
      ajuste_manual: 50,
    });

    expect(updated.descripcion).toBe("Actualizada");
    expect(updated.medioPago?.nombre).toBe("Efectivo");
    expect(updated.persona?.nombre).toBe("Tia");
    expect(updated.ajuste_manual).toBe(50);

    const idsDespues = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .map((i) => i.id)
      .sort();
    expect(idsDespues).toEqual(idsAntes);
  });

  test("updateDebt regenera cuotas y borra los movements de las pendientes reemplazadas", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Regenerar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const movsAntes = testDb.select().from(schema.movements).all();
    expect(movsAntes.length).toBe(3);
    const oldMovementIds = movsAntes.map((m) => m.id);

    repo.updateDebt(debt.id, { importe_total: 4000, cant_cuotas: 4 });

    const movsDespues = testDb.select().from(schema.movements).all();
    expect(movsDespues.length).toBe(4);
    const stillPresent = movsDespues.filter((m) => oldMovementIds.includes(m.id));
    expect(stillPresent.length).toBe(0);
  });

  test("deleteDebt(deleteMovements:false) conserva los movements y limpia installment_id", () => {
    const { tarjetaMP, beto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "A eliminar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const id = debt.id;

    repo.deleteDebt(id, { deleteMovements: false });

    expect(repo.getDebtById(id)).toBeUndefined();
    const movs = testDb.select().from(schema.movements).all();
    expect(movs.length).toBe(1);
    expect(movs[0]?.installment_id).toBeNull();
  });
});

describe("Totales", () => {
  test("totalsByMedioPago suma importe_total + ajuste_manual por medio de pago", () => {
    const { tarjetaMP, efectivo, beto, tia } = seedTestTags(testDb);
    repo.createDebt({
      descripcion: "Deuda 1",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 1000,
      ajuste_manual: 50,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    repo.createDebt({
      descripcion: "Deuda 2",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: tia.id,
      importe_total: 2000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    repo.createDebt({
      descripcion: "Deuda 3",
      direccion: "yo_debo",
      medio_pago_tag_id: efectivo.id,
      importe_total: 500,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const totals = repo.totalsByMedioPago();
    const tarjeta = totals.find((t) => t.nombre === "Tarjeta MP");
    const efectivoTotals = totals.find((t) => t.nombre === "Efectivo");

    expect(tarjeta?.deuda_total).toBe(3050);
    expect(tarjeta?.pagado).toBe(0);
    expect(tarjeta?.resto).toBe(3050);
    expect(efectivoTotals?.deuda_total).toBe(500);
  });

  test("totalsByPersonaBidireccional separa me_debe / le_debo por persona", () => {
    const { tarjetaMP, tia } = seedTestTags(testDb);
    repo.createDebt({
      descripcion: "Yo le debo a Tia",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: tia.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    repo.createDebt({
      descripcion: "Tia me debe",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: tia.id,
      importe_total: 500,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const totals = repo.totalsByPersonaBidireccional();
    const tiaTotals = totals.find((t) => t.nombre === "Tia");
    expect(tiaTotals?.le_debo).toBe(1000);
    expect(tiaTotals?.me_debe).toBe(500);
  });

  test("totalsByPersonaBidireccional refleja pagos parciales", () => {
    const { tarjetaMP, beto, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuota1 = installmentsRepo.listInstallmentsByDebt(debt.id).find((i) => i.nro === 1);
    if (!cuota1) throw new Error("setup inválido");
    installmentsRepo.payInstallment(cuota1.id, {
      tagIds: [tipoVariable.id, concepto.id, pagado.id],
    });

    const totals = repo.totalsByPersonaBidireccional();
    const betoTotals = totals.find((t) => t.nombre === "Beto");
    expect(betoTotals?.me_debe).toBe(20000);
  });
});

describe("Generación automática de cuotas (issue-008/issue-018)", () => {
  test("crear deuda yo_debo en N cuotas genera N installments con fechas mensuales y movement", () => {
    const { tarjetaMP, beto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-31",
      fecha_inicio: "2026-01-31",
    });

    const all = installmentsRepo.listInstallmentsByDebt(debt.id);

    expect(all.length).toBe(3);
    expect(all.map((i) => i.importe)).toEqual([10000, 10000, 10000]);
    // clamp a fin de mes: 31/01 -> 28/02 -> 31/03
    expect(all.map((i) => i.fecha_prevista).sort()).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
    expect(all.every((i) => i.estado === "pendiente")).toBe(true);
    expect(all.every((i) => i.movement_id != null)).toBe(true);
  });
});

describe("Pago de cuotas y vínculo a Movement (issue-008)", () => {
  test("payInstallment de una deuda yo_debo crea/actualiza un Movement direccion=out", () => {
    const { tarjetaMP, beto, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuota1 = installmentsRepo.listInstallmentsByDebt(debt.id).find((i) => i.nro === 1);
    expect(cuota1).toBeDefined();
    if (!cuota1) return;

    const updated = installmentsRepo.payInstallment(cuota1.id, {
      tagIds: [tipoVariable.id, concepto.id, pagado.id],
    });

    expect(updated.estado).toBe("pagada");
    expect(updated.movement_id).not.toBeNull();

    const movement = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, updated.movement_id as number))
      .get();
    expect(movement?.direccion).toBe("out");
    expect(movement?.monto_total).toBe(10000);
    expect(movement?.installment_id).toBe(cuota1.id);
  });

  test("payInstallment de una deuda me_deben crea/actualiza un Movement direccion=in", () => {
    const { tarjetaMP, beto, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Me debe Beto",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuota1 = installmentsRepo.listInstallmentsByDebt(debt.id).find((i) => i.nro === 1);
    expect(cuota1).toBeDefined();
    if (!cuota1) return;

    const updated = installmentsRepo.payInstallment(cuota1.id, {
      fecha: "2026-02-15",
      tagIds: [tipoVariable.id, concepto.id, pagado.id],
    });

    expect(updated.estado).toBe("pagada");
    const movement = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, updated.movement_id as number))
      .get();
    expect(movement?.direccion).toBe("in");
    expect(movement?.fecha).toBe("2026-02-15");
    expect(movement?.monto_total).toBe(10000);
    expect(movement?.installment_id).toBe(cuota1.id);
  });

  test("rechaza pagar una cuota ya pagada", () => {
    const { tarjetaMP, beto, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    expect(cuota).toBeDefined();
    if (!cuota) return;

    installmentsRepo.payInstallment(cuota.id, {
      tagIds: [tipoVariable.id, concepto.id, pagado.id],
    });

    expect(() =>
      installmentsRepo.payInstallment(cuota.id, {
        tagIds: [tipoVariable.id, concepto.id, pagado.id],
      })
    ).toThrow();
  });
});

describe("Proyección mensual de cuotas (issue-008)", () => {
  test("projectInstallmentsByMonth suma cuotas pendientes + ajuste_manual por medio de pago, solo yo_debo", () => {
    const { tarjetaMP, efectivo, beto, tia } = seedTestTags(testDb);

    repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      ajuste_manual: 150,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    repo.createDebt({
      descripcion: "Regalo Tia - Mate",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: tia.id,
      importe_total: 15916 * 3,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    repo.createDebt({
      descripcion: "Compra efectivo",
      direccion: "yo_debo",
      medio_pago_tag_id: efectivo.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const projection = installmentsRepo.projectInstallmentsByMonth(2026, 1);
    const tarjeta = projection.find((p) => p.nombre === "Tarjeta MP");
    const efectivoProj = projection.find((p) => p.nombre === "Efectivo");

    // solo la cuota yo_debo de enero (Gatos Beto); la de me_deben no debe sumarse
    expect(tarjeta?.cuotas_total).toBe(10000);
    expect(tarjeta?.ajuste_manual).toBe(150);
    expect(tarjeta?.total).toBe(10150);

    expect(efectivoProj?.cuotas_total).toBe(1000);
    expect(efectivoProj?.ajuste_manual).toBe(0);
    expect(efectivoProj?.total).toBe(1000);
  });

  test("projectInstallmentsByMonth excluye cuotas ya pagadas", () => {
    const { tarjetaMP, beto, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuotaEnero = installmentsRepo.listInstallmentsByDebt(debt.id).find((i) => i.nro === 1);
    if (!cuotaEnero) throw new Error("setup inválido");

    installmentsRepo.payInstallment(cuotaEnero.id, {
      tagIds: [tipoVariable.id, concepto.id, pagado.id],
    });

    const projection = installmentsRepo.projectInstallmentsByMonth(2026, 1);
    const tarjeta = projection.find((p) => p.nombre === "Tarjeta MP");
    expect(tarjeta).toBeUndefined();
  });
});

describe("Frecuencia configurable (issue-014)", () => {
  test("frecuencia mensual (default): fechas mensuales con clamp de fin de mes", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Mensual",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-31",
      fecha_inicio: "2026-01-31",
    });
    const cuotas = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    expect(cuotas.map((i) => i.fecha_prevista)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  test("frecuencia días: suma frecuencia_dias por cuota desde fecha_inicio", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Quincenal",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
      frecuencia: "dias",
      frecuencia_dias: 15,
    });
    const cuotas = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    expect(cuotas.map((i) => i.fecha_prevista)).toEqual(["2026-01-10", "2026-01-25", "2026-02-09"]);
  });
});

describe("Reparto con residuo (issue-014)", () => {
  test("la última cuota absorbe el centavo sobrante: suma == importe_total", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Con residuo",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 100,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuotas = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    expect(cuotas.map((i) => i.importe)).toEqual([33.33, 33.33, 33.34]);
    const suma = cuotas.reduce((acc, i) => acc + i.importe, 0);
    expect(Math.round(suma * 100) / 100).toBe(100);
  });
});

describe("Movimientos automáticos al crear la deuda (issue-014)", () => {
  test("yo_debo genera un Movement Adeudado direccion=out por cada cuota", () => {
    const { tarjetaMP, beto, concepto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const all = installmentsRepo.listInstallmentsByDebt(debt.id);
    expect(all.every((i) => i.movement_id != null)).toBe(true);

    const movs = testDb.select().from(schema.movements).all();
    expect(movs.length).toBe(3);
    for (const m of movs) {
      expect(m.direccion).toBe("out");
      expect(m.detalle).toMatch(/^Cta \d\/3 - Gatos Beto$/);
    }

    const tagMap = movs.map((m) =>
      testDb
        .select({ tag: schema.tags })
        .from(schema.movement_tags)
        .innerJoin(schema.tags, eq(schema.tags.id, schema.movement_tags.tag_id))
        .where(eq(schema.movement_tags.movement_id, m.id))
        .all()
        .map((r) => r.tag.nombre)
    );
    for (const tagNames of tagMap) {
      expect(tagNames).toContain("Variable");
      expect(tagNames).toContain("Adeudado");
      expect(tagNames).toContain("Gas");
    }
  });

  test("me_deben genera un Movement de ingreso Adeudado por cada cuota", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Me debe Juan",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 6000,
      cant_cuotas: 2,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuotas = installmentsRepo.listInstallmentsByDebt(debt.id);
    expect(cuotas.length).toBe(2);
    expect(cuotas.every((i) => i.movement_id != null)).toBe(true);

    const movs = testDb.select().from(schema.movements).all();
    expect(movs.every((m) => m.direccion === "in")).toBe(true);
  });
});

describe("Sincronización bidireccional cuota <-> movimiento (issue-014)", () => {
  test("toggleInstallmentEstado marca pagada la cuota y sincroniza el movimiento existente a Pagado", () => {
    const { tarjetaMP, concepto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Sync test",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota) throw new Error("setup inválido");

    const movsBefore = testDb.select().from(schema.movements).all();
    expect(movsBefore.length).toBe(1);

    const updated = installmentsRepo.toggleInstallmentEstado(cuota.id, "2026-01-15");
    expect(updated.estado).toBe("pagada");
    expect(updated.fecha_pago).toBe("2026-01-15");

    const movsAfter = testDb.select().from(schema.movements).all();
    expect(movsAfter.length).toBe(1);

    const movTags = testDb
      .select({ tag: schema.tags })
      .from(schema.movement_tags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.movement_tags.tag_id))
      .where(eq(schema.movement_tags.movement_id, movsAfter[0]?.id as number))
      .all()
      .map((r) => r.tag.nombre);
    expect(movTags).toContain("Pagado");
    expect(movTags).not.toContain("Adeudado");
  });

  test("toggleInstallmentEstado revierte a pendiente y sincroniza el movimiento a Adeudado", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Sync revert",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota) throw new Error("setup inválido");

    installmentsRepo.toggleInstallmentEstado(cuota.id);
    const reverted = installmentsRepo.toggleInstallmentEstado(cuota.id);
    expect(reverted.estado).toBe("pendiente");
    expect(reverted.fecha_pago).toBeNull();

    const mov = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, reverted.movement_id as number))
      .get();
    const movTags = testDb
      .select({ tag: schema.tags })
      .from(schema.movement_tags)
      .innerJoin(schema.tags, eq(schema.tags.id, schema.movement_tags.tag_id))
      .where(eq(schema.movement_tags.movement_id, mov?.id as number))
      .all()
      .map((r) => r.tag.nombre);
    expect(movTags).toContain("Adeudado");
    expect(movTags).not.toContain("Pagado");
  });

  test("syncInstallmentFromMovement: marcar Pagado el movimiento sincroniza la cuota ligada", () => {
    const { tarjetaMP, concepto, tipoVariable, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Sync desde movimiento",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota || cuota.movement_id == null) throw new Error("setup inválido");

    testDb
      .update(schema.movements)
      .set({ fecha: "2026-01-20" })
      .where(eq(schema.movements.id, cuota.movement_id))
      .run();
    testDb
      .delete(schema.movement_tags)
      .where(eq(schema.movement_tags.movement_id, cuota.movement_id))
      .run();
    testDb
      .insert(schema.movement_tags)
      .values([
        { movement_id: cuota.movement_id, tag_id: tipoVariable.id },
        { movement_id: cuota.movement_id, tag_id: pagado.id },
        { movement_id: cuota.movement_id, tag_id: concepto.id },
      ])
      .run();

    const synced = installmentsRepo.syncInstallmentFromMovement(cuota.movement_id);
    expect(synced?.estado).toBe("pagada");
    expect(synced?.fecha_pago).toBe("2026-01-20");
  });

  test("updateInstallment con fecha_prevista nueva propaga la fecha al movimiento vinculado", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Fecha cuota -> movimiento",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota || cuota.movement_id == null) throw new Error("setup inválido");

    installmentsRepo.updateInstallment(cuota.id, { fecha_prevista: "2026-01-25" });

    const mov = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, cuota.movement_id))
      .get();
    expect(mov?.fecha).toBe("2026-01-25");
  });

  test("updateInstallment con importe nuevo propaga monto_total al movimiento vinculado por defecto", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Importe cuota -> movimiento",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota || cuota.movement_id == null) throw new Error("setup inválido");

    installmentsRepo.updateInstallment(cuota.id, { importe: 1500 });

    const mov = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, cuota.movement_id))
      .get();
    expect(mov?.monto_total).toBe(1500);
  });

  test("updateInstallment con propagarAMovimiento:false no modifica el movimiento vinculado", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Importe cuota sin propagar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota || cuota.movement_id == null) throw new Error("setup inválido");
    const montoOriginal = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, cuota.movement_id))
      .get()?.monto_total;

    installmentsRepo.updateInstallment(cuota.id, { importe: 1500, propagarAMovimiento: false });

    const mov = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, cuota.movement_id))
      .get();
    expect(mov?.monto_total).toBe(montoOriginal);
  });

  test("listInstallmentsByDebt incluye movement_monto_total del movimiento vinculado", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Divergencia cuota/movimiento",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota || cuota.movement_id == null) throw new Error("setup inválido");
    expect(cuota.movement_monto_total).toBe(1000);

    installmentsRepo.updateInstallment(cuota.id, { importe: 1500, propagarAMovimiento: false });

    const cuotaActualizada = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    expect(cuotaActualizada?.importe).toBe(1500);
    expect(cuotaActualizada?.movement_monto_total).toBe(1000);
  });

  test("syncInstallmentFromMovement propaga la fecha del movimiento a fecha_prevista de la cuota", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Fecha movimiento -> cuota",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const cuota = installmentsRepo.listInstallmentsByDebt(debt.id)[0];
    if (!cuota || cuota.movement_id == null) throw new Error("setup inválido");

    testDb
      .update(schema.movements)
      .set({ fecha: "2026-02-05" })
      .where(eq(schema.movements.id, cuota.movement_id))
      .run();

    const synced = installmentsRepo.syncInstallmentFromMovement(cuota.movement_id);
    expect(synced?.fecha_prevista).toBe("2026-02-05");
  });
});

describe("updateDebt regenera cuotas pendientes (issue-014)", () => {
  test("preserva ids de cuotas pagadas pero propaga el nuevo importe total a todas (issue-027)", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Regenerar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuota1 = installmentsRepo.listInstallmentsByDebt(debt.id).find((i) => i.nro === 1);
    if (!cuota1) throw new Error("setup inválido");
    installmentsRepo.toggleInstallmentEstado(cuota1.id);

    repo.updateDebt(debt.id, { importe_total: 4000, cant_cuotas: 4 });

    const all = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);

    expect(all.length).toBe(4);
    expect(all[0]?.id).toBe(cuota1.id);
    expect(all[0]?.estado).toBe("pagada");
    expect(all[0]?.importe).toBe(1000);
    expect(all.slice(1).every((i) => i.estado === "pendiente")).toBe(true);
    const sumaTotal = round2(all.reduce((acc, i) => acc + i.importe, 0));
    expect(sumaTotal).toBe(4000);
  });

  test("issue-027: sube importe de cuota con 8/9 pagadas y redistribuye sobre el total, no solo la pendiente", () => {
    const { tarjetaMP, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Deuda 9 cuotas",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      importe_total: 90000,
      cant_cuotas: 9,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuotas = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    for (const cuota of cuotas.slice(0, 8)) {
      installmentsRepo.payInstallment(cuota.id, {
        tagIds: [tipoVariable.id, concepto.id, pagado.id],
      });
    }

    const nuevoTotal = round2(10787 * 9);
    repo.updateDebt(debt.id, { importe_total: nuevoTotal });

    const after = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    expect(after.length).toBe(9);

    for (const cuota of after) {
      expect(cuota.importe).toBeCloseTo(10787, 1);
      if (cuota.movement_id != null) {
        const movement = testDb
          .select()
          .from(schema.movements)
          .where(eq(schema.movements.id, cuota.movement_id))
          .get();
        expect(movement?.monto_total).toBeCloseTo(10787, 1);
      }
    }

    const sumaTotal = round2(after.reduce((acc, i) => acc + i.importe, 0));
    expect(sumaTotal).toBe(nuevoTotal);
    expect(after.slice(0, 8).every((i) => i.estado === "pagada")).toBe(true);
    expect(after[8]?.estado).toBe("pendiente");
  });

  test("payload idéntico no regenera cuotas (ids estables)", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Sin cambios",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    const idsAntes = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .map((i) => i.id)
      .sort();

    repo.updateDebt(debt.id, {
      importe_total: 3000,
      cant_cuotas: 3,
      fecha_inicio: "2026-01-10",
      frecuencia: "mensual",
      direccion: "yo_debo",
    });

    const idsDespues = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .map((i) => i.id)
      .sort();
    expect(idsDespues).toEqual(idsAntes);
  });

  test("rechaza reducir cant_cuotas por debajo de las ya pagadas", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "No reducir",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const cuotas = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    installmentsRepo.toggleInstallmentEstado(cuotas[0]?.id as number);
    installmentsRepo.toggleInstallmentEstado(cuotas[1]?.id as number);

    expect(() => repo.updateDebt(debt.id, { cant_cuotas: 1 })).toThrow();
  });
});

describe("Soft delete de deudas (issue-014)", () => {
  test("deleteDebt marca deleted_at, borra cuotas y movimientos ligados; listDebts ya no la incluye", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "A borrar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 1000,
      cant_cuotas: 2,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const movsBefore = testDb.select().from(schema.movements).all();
    expect(movsBefore.length).toBe(2);

    repo.deleteDebt(debt.id);

    expect(repo.getDebtById(debt.id)).toBeUndefined();
    expect(repo.listDebts().find((d) => d.id === debt.id)).toBeUndefined();

    const deletedRow = testDb.select().from(schema.debts).where(eq(schema.debts.id, debt.id)).get();
    expect(deletedRow?.deleted_at).not.toBeNull();

    const installmentsAfter = testDb
      .select()
      .from(schema.installments)
      .where(eq(schema.installments.debt_id, debt.id))
      .all();
    expect(installmentsAfter.length).toBe(0);

    const movsAfter = testDb.select().from(schema.movements).all();
    expect(movsAfter.length).toBe(0);
  });
});

describe("Deudas derivadas (shareDebt / listDerivedDebts / issue-018)", () => {
  function crearPadre() {
    const { tarjetaMP } = seedTestTags(testDb);
    return {
      tarjetaMP,
      padre: repo.createDebt({
        descripcion: "Compra compartida",
        direccion: "yo_debo",
        medio_pago_tag_id: tarjetaMP.id,
        importe_total: 30000,
        cant_cuotas: 3,
        fecha: "2026-01-10",
        fecha_inicio: "2026-01-10",
      }),
    };
  }

  test("shareDebt crea N derivadas me_deben con parent_debt_id y movements in Adeudado", () => {
    const { tia, ana } = seedTestTags(testDb);
    const { padre } = crearPadre();

    const derivadas = repo.shareDebt(padre.id, [
      { persona_tag_id: tia.id, importe: 10000 },
      { persona_tag_id: ana.id, porcentaje: 50 },
    ]);

    expect(derivadas.length).toBe(2);
    for (const d of derivadas) {
      expect(d.direccion).toBe("me_deben");
      expect(d.parent_debt_id).toBe(padre.id);
      expect(d.cant_cuotas).toBe(padre.cant_cuotas);
      expect(d.fecha_inicio).toBe(padre.fecha_inicio);
    }
    const dTia = derivadas.find((d) => d.persona?.id === tia.id);
    const dAna = derivadas.find((d) => d.persona?.id === ana.id);
    expect(dTia?.importe_total).toBe(10000);
    expect(dAna?.importe_total).toBe(15000);

    const movs = testDb.select().from(schema.movements).all();
    // 3 del padre + 3 de cada derivada
    expect(movs.length).toBe(9);
    const inMovs = movs.filter((m) => m.direccion === "in");
    expect(inMovs.length).toBe(6);

    const parentAfter = repo.getDebtById(padre.id);
    expect(parentAfter?.derivadas_count).toBe(2);

    const listed = repo.listDerivedDebts(padre.id);
    expect(listed.length).toBe(2);
    expect(listed.every((d) => d.parent_descripcion === padre.descripcion)).toBe(true);
  });

  test("shareDebt rechaza si la suma de splits excede el importe del padre", () => {
    const { tia } = seedTestTags(testDb);
    const { padre } = crearPadre();
    expect(() => repo.shareDebt(padre.id, [{ persona_tag_id: tia.id, importe: 30001 }])).toThrow();
  });

  test("shareDebt rechaza split sin importe ni porcentaje, o con ambos", () => {
    const { tia } = seedTestTags(testDb);
    const { padre } = crearPadre();
    expect(() => repo.shareDebt(padre.id, [{ persona_tag_id: tia.id }])).toThrow();
    expect(() =>
      repo.shareDebt(padre.id, [{ persona_tag_id: tia.id, importe: 100, porcentaje: 10 }])
    ).toThrow();
  });

  test("shareDebt rechaza persona duplicada dentro del mismo llamado", () => {
    const { tia } = seedTestTags(testDb);
    const { padre } = crearPadre();
    expect(() =>
      repo.shareDebt(padre.id, [
        { persona_tag_id: tia.id, importe: 1000 },
        { persona_tag_id: tia.id, importe: 2000 },
      ])
    ).toThrow();
  });

  test("shareDebt rechaza si el padre no es yo_debo o ya es derivada", () => {
    const { tia, ana } = seedTestTags(testDb);
    const meDeben = repo.createDebt({
      descripcion: "Me deben",
      direccion: "me_deben",
      importe_total: 1000,
      cant_cuotas: 1,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });
    expect(() => repo.shareDebt(meDeben.id, [{ persona_tag_id: tia.id, importe: 500 }])).toThrow();

    const { padre } = crearPadre();
    const [derivada] = repo.shareDebt(padre.id, [{ persona_tag_id: ana.id, importe: 5000 }]);
    expect(() =>
      repo.shareDebt((derivada as { id: number }).id, [{ persona_tag_id: tia.id, importe: 1000 }])
    ).toThrow();
  });
});

describe("updateDebt y fecha_inicio", () => {
  test("cambiar fecha_inicio no regenera cuotas ni movimientos vinculados", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Prestamo",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 15000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const before = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    const idsBefore = before.map((i) => i.id);
    const movementIdsBefore = before.map((i) => i.movement_id);
    const fechasBefore = before.map((i) => i.fecha_prevista);

    const updated = repo.updateDebt(debt.id, { fecha_inicio: "2026-03-01" });
    expect(updated.fecha_inicio).toBe("2026-03-01");

    const after = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    expect(after.map((i) => i.id)).toEqual(idsBefore);
    expect(after.map((i) => i.movement_id)).toEqual(movementIdsBefore);
    expect(after.map((i) => i.fecha_prevista)).toEqual(fechasBefore);
  });

  test("cambiar importe_total sigue regenerando cuotas pendientes como antes", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Prestamo variable",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 9000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const before = installmentsRepo.listInstallmentsByDebt(debt.id);
    const idsBefore = before.map((i) => i.id).sort();

    repo.updateDebt(debt.id, { importe_total: 12000 });

    const after = installmentsRepo.listInstallmentsByDebt(debt.id);
    const idsAfter = after.map((i) => i.id).sort();
    expect(idsAfter).not.toEqual(idsBefore);
    expect(after.reduce((acc, i) => acc + i.importe, 0)).toBeCloseTo(12000, 2);
  });
});

describe("rescheduleInstallments", () => {
  test("recalcula fecha_prevista de todas las cuotas (pagadas y pendientes) y propaga al movimiento", () => {
    const { tarjetaMP, beto, tipoVariable, concepto, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      persona_tag_id: beto.id,
      importe_total: 30000,
      cant_cuotas: 3,
      fecha: "2026-01-10",
      fecha_inicio: "2026-01-10",
    });

    const installmentsBefore = installmentsRepo.listInstallmentsByDebt(debt.id);
    expect(installmentsBefore.map((i) => i.fecha_prevista)).toEqual([
      "2026-01-10",
      "2026-02-10",
      "2026-03-10",
    ]);

    const cuota1 = installmentsBefore.find((i) => i.nro === 1);
    if (!cuota1) throw new Error("cuota 1 no encontrada");
    installmentsRepo.payInstallment(cuota1.id, {
      tagIds: [tipoVariable.id, concepto.id, pagado.id],
    });

    const result = installmentsRepo.rescheduleInstallments(debt.id, "2026-02-10");
    expect(result.updated).toBe(3);

    const after = installmentsRepo.listInstallmentsByDebt(debt.id).sort((a, b) => a.nro - b.nro);
    expect(after.map((i) => i.fecha_prevista)).toEqual(["2026-02-10", "2026-03-10", "2026-04-10"]);

    // la cuota pagada se movió también, y conserva id/importe/estado/movement_id
    const cuota1After = after.find((i) => i.nro === 1);
    if (!cuota1After) throw new Error("cuota 1 no encontrada tras reschedule");
    expect(cuota1After.id).toBe(cuota1.id);
    expect(cuota1After.estado).toBe("pagada");
    expect(cuota1After.movement_id).toBe(cuota1.movement_id);
    expect(cuota1After.importe).toBe(cuota1.importe);
    // fecha_pago acompaña a fecha_prevista: no debe quedar desincronizada del movimiento
    expect(cuota1After.fecha_pago).toBe("2026-02-10");

    // el movimiento vinculado a la cuota pagada acompaña la nueva fecha
    if (cuota1After.movement_id == null) throw new Error("movement_id nulo");
    const movement = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, cuota1After.movement_id))
      .get();
    expect(movement?.fecha).toBe("2026-02-10");
  });

  test("regenera el detalle del movimiento con la descripción vigente de la deuda", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Descripción original",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 10000,
      cant_cuotas: 2,
      fecha: "2026-01-05",
      fecha_inicio: "2026-01-05",
    });

    repo.updateDebt(debt.id, { descripcion: "Descripción nueva" });

    installmentsRepo.rescheduleInstallments(debt.id, "2026-01-05");

    const installments = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .sort((a, b) => a.nro - b.nro);
    const first = installments[0];
    if (!first?.movement_id) throw new Error("cuota sin movimiento");
    const movement = testDb
      .select()
      .from(schema.movements)
      .where(eq(schema.movements.id, first.movement_id))
      .get();
    expect(movement?.detalle).toBe("Cta 1/2 - Descripción nueva");
  });

  test("respeta frecuencia dias con frecuencia_dias configurado", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Cuotas quincenales",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 6000,
      cant_cuotas: 3,
      fecha: "2026-01-01",
      fecha_inicio: "2026-01-01",
      frecuencia: "dias",
      frecuencia_dias: 15,
    });

    installmentsRepo.rescheduleInstallments(debt.id, "2026-02-01");

    const installments = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .sort((a, b) => a.nro - b.nro);
    expect(installments.map((i) => i.fecha_prevista)).toEqual([
      "2026-02-01",
      "2026-02-16",
      "2026-03-03",
    ]);
  });

  test("clampea correctamente meses de 30 dias y febrero cuando la primera cuota cae el dia 31", () => {
    const { tarjetaMP } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Cuota fin de mes",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      importe_total: 9000,
      cant_cuotas: 3,
      fecha: "2026-01-15",
      fecha_inicio: "2026-01-15",
    });

    installmentsRepo.rescheduleInstallments(debt.id, "2026-01-31");

    const installments = installmentsRepo
      .listInstallmentsByDebt(debt.id)
      .sort((a, b) => a.nro - b.nro);
    // 2026-01-31 -> feb (28, no bisiesto) -> clamp a 28 -> mar (31) -> vuelve al dia 31
    expect(installments.map((i) => i.fecha_prevista)).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
    ]);
  });
});

describe("Propagación de tags de deuda a movimientos (issue-022)", () => {
  test("generateInstallmentsForDebt propaga concepto, medio de pago y persona al movimiento", () => {
    const { tarjetaMP, beto, concepto, tipoVariable, adeudado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Aire Acond. Cetrogar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      persona_tag_id: beto.id,
      importe_total: 9000,
      cant_cuotas: 3,
      fecha: "2026-01-15",
      fecha_inicio: "2026-01-15",
    });

    const [installment] = installmentsRepo.listInstallmentsByDebt(debt.id);
    expect(installment?.movement_id).toBeDefined();
    const movement = movementsRepo.getMovementById(installment?.movement_id as number);
    expect(movement).toBeDefined();

    const tagNames = movement?.tags.map((t) => t.nombre).sort();
    expect(tagNames).toEqual(
      [tipoVariable.nombre, adeudado.nombre, concepto.nombre, tarjetaMP.nombre, beto.nombre].sort()
    );
  });

  test("una deuda sin medio de pago ni persona no agrega tags espurios", () => {
    const { concepto, tipoVariable, adeudado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Sin medio de pago ni persona",
      direccion: "yo_debo",
      concepto_tag_id: concepto.id,
      importe_total: 5000,
      cant_cuotas: 1,
      fecha: "2026-01-15",
      fecha_inicio: "2026-01-15",
    });

    const [installment] = installmentsRepo.listInstallmentsByDebt(debt.id);
    const movement = movementsRepo.getMovementById(installment?.movement_id as number);

    const tagNames = movement?.tags.map((t) => t.nombre).sort();
    expect(tagNames).toEqual([tipoVariable.nombre, adeudado.nombre, concepto.nombre].sort());
  });

  test("toggleInstallmentEstado sobre cuota sin movimiento previo crea el movimiento con los tags de la deuda", () => {
    const { tarjetaMP, beto, concepto, tipoVariable, pagado } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Gatos Beto",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      persona_tag_id: beto.id,
      importe_total: 3000,
      cant_cuotas: 1,
      fecha: "2026-01-15",
      fecha_inicio: "2026-01-15",
    });
    const [installment] = installmentsRepo.listInstallmentsByDebt(debt.id);
    const movementId = installment?.movement_id as number;

    // Simula una cuota sin movimiento previo (histórico anterior al feature).
    testDb
      .update(schema.installments)
      .set({ movement_id: null })
      .where(eq(schema.installments.id, installment?.id as number))
      .run();
    testDb.delete(schema.movements).where(eq(schema.movements.id, movementId)).run();

    const toggled = installmentsRepo.toggleInstallmentEstado(installment?.id as number);
    expect(toggled.movement_id).toBeDefined();
    const newMovement = movementsRepo.getMovementById(toggled.movement_id as number);
    const tagNames = newMovement?.tags.map((t) => t.nombre).sort();
    expect(tagNames).toEqual(
      [tipoVariable.nombre, pagado.nombre, concepto.nombre, tarjetaMP.nombre, beto.nombre].sort()
    );
  });

  test("regenerar cuotas vía updateDebt (cambiando importe_total) produce movimientos con los tags completos", () => {
    const { tarjetaMP, beto, concepto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Deuda a regenerar",
      direccion: "yo_debo",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      persona_tag_id: beto.id,
      importe_total: 3000,
      cant_cuotas: 3,
      fecha: "2026-01-15",
      fecha_inicio: "2026-01-15",
    });

    repo.updateDebt(debt.id, { importe_total: 6000 });

    const regenerated = installmentsRepo.listInstallmentsByDebt(debt.id);
    for (const installment of regenerated) {
      const movement = movementsRepo.getMovementById(installment.movement_id as number);
      const tagKinds = [...(movement?.tags.map((t) => t.kind) ?? [])].sort();
      expect(tagKinds).toEqual(
        (["concepto", "estado", "medio_pago", "persona", "tipo"] as const).toSorted()
      );
    }
  });

  test("una deuda me_deben genera movimientos in con tags de persona y medio de pago sin error de validación", () => {
    const { tarjetaMP, tia, concepto } = seedTestTags(testDb);
    const debt = repo.createDebt({
      descripcion: "Regalo Tia",
      direccion: "me_deben",
      medio_pago_tag_id: tarjetaMP.id,
      concepto_tag_id: concepto.id,
      persona_tag_id: tia.id,
      importe_total: 5000,
      cant_cuotas: 1,
      fecha: "2026-01-15",
      fecha_inicio: "2026-01-15",
    });

    const [installment] = installmentsRepo.listInstallmentsByDebt(debt.id);
    const movement = movementsRepo.getMovementById(installment?.movement_id as number);
    expect(movement?.direccion).toBe("in");
    expect(movement?.tags.map((t) => t.nombre)).toContain(tia.nombre);
    expect(movement?.tags.map((t) => t.nombre)).toContain(tarjetaMP.nombre);
  });
});
