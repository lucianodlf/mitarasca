#!/usr/bin/env bun
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import {
  type DbClient,
  type DebtDirection,
  type DebtFrecuencia,
  type DuplicateNivel,
  type InvisibleModo,
  type InvisibleRule,
  type MovementDirection,
  buildFinancialReport,
  createDebt,
  createInvisibleRule,
  createMovement,
  deleteDebt,
  deleteInvisibleRule,
  deleteMovement,
  ensureDb,
  findExactInDb,
  findExactPairs,
  findReflejos,
  getDb,
  getDebtById,
  getInstallmentById,
  getLastMovement,
  getMovementById,
  getYearBalanceWithEstimate,
  listDebts,
  listInvisibleRules,
  listMovementsByDateRange,
  makeMovementsRepo,
  partitionImages,
  partitionInvisibleCandidates,
  payInstallment,
  recordFinding,
  renderReportMarkdown,
  resolveDbPath,
  setInvisibleRuleActiva,
  shareDebt,
  summarizeByMonth,
  totalsByMedioPago,
  totalsByPersonaBidireccional,
  updateDebt,
  updateInstallment,
  updateMovement,
} from "@mitarasca/core";
import { loadConfig, resolveConfigPath } from "@mitarasca/core";
// Subpath aparte: el barrel lo importa también la web (vía tipos de la api) y no tiene bun-types.
import { seedDemoDb } from "@mitarasca/core/seed-demo";
import { Command } from "commander";
import { z } from "zod";
import { runInstall } from "./install.js";
import type { InstallFlags } from "./install.js";
import {
  getConfigValue,
  readScopedConfig,
  setConfigValue,
  writeConfigFile,
} from "./lib/config-cli.js";
import { currentYearMonth, monthRange, parseMes } from "./lib/dates.js";
import {
  type DedupFindingJson,
  type DedupJsonOutput,
  renderDedupText,
} from "./lib/dedup-output.js";
import { formatDayMonth, formatMoney, formatSigned, formatTable } from "./lib/format.js";
import { resolveTagsForCreate, resolveTagsForUpdate } from "./lib/tags.js";
import type { TagsCreateInput, TagsUpdateInput } from "./lib/tags.js";
import { startServer } from "./serve.js";
import { runUninstall } from "./uninstall.js";

const DB_PATH_HELP =
  "La ruta de la DB se resuelve en este orden: DB_PATH, --demo (o MITARASCA_DEMO=1), db_path del config (mitarasca config set db_path ...) y la ruta por defecto. Primera vez: mitarasca init (base vacía) o mitarasca demo (datos de ejemplo).";

const program = new Command();

program
  .name("mitarasca")
  .description("mitarasca: finanzas personales. Movimientos, balance, deudas, web y servidor MCP")
  .option("--demo", "Usa la DB de demo en vez de la tuya (equivale a MITARASCA_DEMO=1)")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .hook("preAction", () => {
    if (program.opts().demo) process.env.MITARASCA_DEMO = "1";
  });

function parseDireccionMovimiento(value: string): MovementDirection {
  if (value !== "in" && value !== "out") {
    throw new Error(`--direccion inválida: "${value}" (esperado "in" o "out")`);
  }
  return value;
}

function parseModoBalance(value: string): "proyectado" | "real" {
  if (value !== "proyectado" && value !== "real") {
    throw new Error(`--mode inválido: "${value}" (esperado "proyectado" o "real")`);
  }
  return value;
}

function parseModoInforme(value: string): "proyectado" | "real" {
  if (value !== "proyectado" && value !== "real") {
    throw new Error(`--modo inválido: "${value}" (esperado "proyectado" o "real")`);
  }
  return value;
}

function parseFormatoInforme(value: string): "json" | "md" {
  if (value !== "json" && value !== "md") {
    throw new Error(`--formato inválido: "${value}" (esperado "json" o "md")`);
  }
  return value;
}

function parseDireccionDeuda(value: string): DebtDirection {
  if (value !== "yo_debo" && value !== "me_deben") {
    throw new Error(`--direccion inválida: "${value}" (esperado "yo_debo" o "me_deben")`);
  }
  return value;
}

function parseFrecuencia(value: string): DebtFrecuencia {
  if (value !== "mensual" && value !== "dias") {
    throw new Error(`--frecuencia inválida: "${value}" (esperado "mensual" o "dias")`);
  }
  return value;
}

function parseModoInvisible(value: string): InvisibleModo {
  if (value !== "exacto" && value !== "contiene") {
    throw new Error(`--modo inválido: "${value}" (esperado "exacto" o "contiene")`);
  }
  return value;
}

function parseNumero(nombre: string, value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${nombre} inválido: "${value}"`);
  return n;
}

program
  .command("movimientos")
  .description("Lista los movimientos de un mes (default: mes actual)")
  .option("--direccion <in|out>", "filtrar por dirección (in = ingreso, out = egreso)")
  .option("--mes <YYYY-MM>", "mes a consultar (default: mes actual)")
  .option("--json", "imprimir salida en formato JSON")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .action((opts: { direccion?: string; mes?: string; json?: boolean }) => {
    const { year, month } = opts.mes ? parseMes(opts.mes) : currentYearMonth();
    const { from, to } = monthRange(year, month);

    let movements = listMovementsByDateRange(from, to);

    if (opts.direccion !== undefined) {
      const direccion = parseDireccionMovimiento(opts.direccion);
      movements = movements.filter((m) => m.direccion === direccion);
    }

    if (opts.json) {
      console.log(JSON.stringify(movements, null, 2));
      return;
    }

    if (movements.length === 0) {
      console.log(`Sin movimientos para ${from} a ${to}.`);
      return;
    }

    const headers = ["Fecha", "Detalle", "Tags", "Monto"];
    const rows = movements.map((m) => [
      formatDayMonth(m.fecha),
      m.detalle,
      m.tags.map((t) => t.nombre).join(", "),
      formatSigned(m.monto_efectivo, m.direccion),
    ]);

    console.log(`Movimientos ${from} a ${to}:\n`);
    console.log(formatTable(headers, rows));
  });

program
  .command("imagenes-nuevas")
  .description("Lista las imágenes de data/inbox/ que todavía no fueron procesadas")
  .option("--dir <ruta>", "Directorio a inspeccionar", "data/inbox")
  .option("--json", "Output en formato JSON")
  .action(async (opts: { dir: string; json?: boolean }) => {
    const glob = new Bun.Glob("*.{png,jpg,jpeg,webp}");
    const paths = (await Array.fromAsync(glob.scan({ cwd: opts.dir, absolute: true }))).sort();
    const { nuevas, salteadas } = await partitionImages(getDb(), paths);

    if (opts.json) {
      console.log(JSON.stringify({ nuevas, salteadas }, null, 2));
      return;
    }
    if (nuevas.length === 0) {
      console.log("No hay imágenes nuevas para procesar.");
    } else {
      console.log(`${nuevas.length} imagen(es) nueva(s):`);
      for (const i of nuevas) console.log(`  ${i.nombre}  ${i.hash.slice(0, 12)}`);
    }
    if (salteadas.length > 0) {
      console.log(`\n${salteadas.length} ya procesada(s) previamente:`);
      for (const i of salteadas) console.log(`  ${i.nombre}  ${i.hash.slice(0, 12)}`);
    }
  });

program
  .command("duplicados")
  .description("Detecta movimientos duplicados (espejos) y posibles duplicados (reflejos)")
  .option("--mes <YYYY-MM>", "Mes a analizar (default: mes actual)")
  .option("--nivel <niveles>", "Niveles a correr, separados por coma", "exacto,reglas")
  .option("--ventana-dias <n>", "Ventana de días para el nivel reglas", "10")
  .option("--json", "Output en formato JSON")
  .action((opts: { mes?: string; nivel: string; ventanaDias: string; json?: boolean }) => {
    const { year, month } = opts.mes ? parseMes(opts.mes) : currentYearMonth();
    const { from, to } = monthRange(year, month);

    const niveles = opts.nivel.split(",").map((n) => n.trim());
    for (const n of niveles) {
      if (n !== "exacto" && n !== "reglas") {
        throw new Error(`Nivel inválido: "${n}" (esperado: exacto, reglas)`);
      }
    }

    const ventanaDias = Number(opts.ventanaDias);
    if (!Number.isFinite(ventanaDias) || ventanaDias < 0) {
      throw new Error(`Ventana de días inválida: "${opts.ventanaDias}"`);
    }

    const findings: DedupFindingJson[] = [];

    // El orden de ejecución es el que pidió el usuario en --nivel.
    for (const nivel of niveles as DuplicateNivel[]) {
      if (nivel === "exacto") {
        for (const par of findExactPairs(from, to)) {
          const f = recordFinding({
            nivel: "exacto",
            movement_a_id: par.a.id,
            movement_b_id: par.b.id,
            motivo: "clave de identidad idéntica",
          });
          findings.push({
            id: f.id,
            nivel: f.nivel,
            nuevo: f.nuevo,
            estado: f.estado,
            motivo: f.motivo,
            score: f.score,
            detectado_en: f.detectado_en,
            a: par.a,
            b: par.b,
          });
        }
      } else {
        for (const par of findReflejos(from, to, { ventanaDias })) {
          const f = recordFinding({
            nivel: "reglas",
            movement_a_id: par.a.id,
            movement_b_id: par.b.id,
            motivo: `monto exacto, ${par.diasDiff} día(s), texto ${par.score.toFixed(2)}`,
            score: par.score,
          });
          findings.push({
            id: f.id,
            nivel: f.nivel,
            nuevo: f.nuevo,
            estado: f.estado,
            motivo: f.motivo,
            score: f.score,
            detectado_en: f.detectado_en,
            diasDiff: par.diasDiff,
            a: par.a,
            b: par.b,
          });
        }
      }
    }

    const out: DedupJsonOutput = {
      rango: { from, to },
      niveles: niveles as DuplicateNivel[],
      findings,
      resumen: {
        total: findings.length,
        nuevos: findings.filter((f) => f.nuevo).length,
        existentes: findings.filter((f) => !f.nuevo).length,
      },
    };

    if (opts.json) {
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    console.log(renderDedupText(out));
  });

program
  .command("ultimo-movimiento")
  .description("Muestra el movimiento con la fecha más reciente registrada")
  .option("--json", "imprimir salida en formato JSON")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .action((opts: { json?: boolean }) => {
    const last = getLastMovement();

    if (opts.json) {
      console.log(JSON.stringify(last ?? null, null, 2));
      return;
    }

    if (!last) {
      console.log("Sin movimientos registrados.");
      return;
    }

    console.log(
      `${formatDayMonth(last.fecha)} — ${last.detalle} (${last.tags.map((t) => t.nombre).join(", ")}) ${formatSigned(last.monto_efectivo, last.direccion)}`
    );
  });

program
  .command("informe")
  .description(
    "Informe resumen (ingresos/egresos por mes y concepto, balance, promedios) para análisis"
  )
  .option("--desde <YYYY-MM>", "primer mes a incluir (default: primer mes con datos)")
  .option("--hasta <YYYY-MM>", "último mes a incluir (default: último mes con datos)")
  .option(
    "--modo <real|proyectado>",
    "real: solo Pagado; proyectado: todo salvo Deshabilitado",
    "real"
  )
  .option("--formato <json|md>", "formato de salida", "json")
  .option("--out <archivo>", "guardar el informe en este archivo en vez de imprimirlo")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .action(
    (opts: { desde?: string; hasta?: string; modo: string; formato: string; out?: string }) => {
      const modo = parseModoInforme(opts.modo);
      const formato = parseFormatoInforme(opts.formato);
      const report = buildFinancialReport({
        modo,
        ...(opts.desde !== undefined ? { desde: opts.desde } : {}),
        ...(opts.hasta !== undefined ? { hasta: opts.hasta } : {}),
      });
      const output =
        formato === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderReportMarkdown(report);

      if (opts.out === undefined) {
        process.stdout.write(output);
        return;
      }
      const target = resolve(opts.out);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, output, "utf8");
      console.log(
        `Informe guardado en ${target} (${report.meta.meses_evaluados} meses, modo ${modo})`
      );
    }
  );

program
  .command("balance")
  .description("Resumen de balance del mes actual, o anual con --year")
  .option("--year <YYYY>", "año a consultar (resumen anual de 12 meses)")
  .option("--mode <proyectado|real>", "modo de cálculo", "proyectado")
  .option("--json", "imprimir salida en formato JSON")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .action((opts: { year?: string; mode: string; json?: boolean }) => {
    const mode = parseModoBalance(opts.mode);

    if (opts.year !== undefined) {
      const year = Number(opts.year);
      if (!Number.isInteger(year)) {
        throw new Error(`--year inválido: "${opts.year}" (esperado un año numérico)`);
      }

      const summary = getYearBalanceWithEstimate(year, mode, { includeVariableEstimate: true });

      if (opts.json) {
        console.log(JSON.stringify(summary, null, 2));
        return;
      }

      const headers = summary.includesVariableEstimate
        ? ["Mes", "Ingresos", "Egresos", "Balance", "Var. estimada"]
        : ["Mes", "Ingresos", "Egresos", "Balance"];

      const rows = summary.months.map((m) => {
        const base = [
          String(m.month).padStart(2, "0"),
          formatMoney(m.ingresos),
          formatMoney(m.egresos),
          formatMoney(m.balance),
        ];
        if (summary.includesVariableEstimate) {
          base.push(m.estimatedVariable !== undefined ? formatMoney(m.estimatedVariable) : "-");
        }
        return base;
      });

      const totalRow = [
        "Total",
        formatMoney(summary.ingresos),
        formatMoney(summary.egresos),
        formatMoney(summary.balance),
      ];
      if (summary.includesVariableEstimate) {
        totalRow.push("-");
      }
      rows.push(totalRow);

      console.log(`Balance ${summary.year} (${summary.mode}):\n`);
      console.log(formatTable(headers, rows));
      return;
    }

    const { year, month } = currentYearMonth();
    const summary = summarizeByMonth(year, month, mode);

    if (opts.json) {
      console.log(JSON.stringify({ year, month, mode, ...summary }, null, 2));
      return;
    }

    console.log(`Balance ${year}-${String(month).padStart(2, "0")} (${mode}):\n`);
    console.log(
      formatTable(
        ["Ingresos", "Egresos", "Balance"],
        [
          [
            formatMoney(summary.ingresos),
            formatMoney(summary.egresos),
            formatMoney(summary.balance),
          ],
        ]
      )
    );
  });

program
  .command("deudas")
  .description("Lista deudas y totales por medio de pago / persona")
  .option("--direccion <yo_debo|me_deben>", "filtrar deudas por dirección")
  .option("--json", "imprimir salida en formato JSON")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .action((opts: { direccion?: string; json?: boolean }) => {
    const direccion =
      opts.direccion !== undefined ? parseDireccionDeuda(opts.direccion) : undefined;
    const debts = direccion !== undefined ? listDebts(direccion) : listDebts();
    const medioPagoTotals = totalsByMedioPago();
    const personaTotals = totalsByPersonaBidireccional();

    if (opts.json) {
      console.log(JSON.stringify({ debts, medioPagoTotals, personaTotals }, null, 2));
      return;
    }

    if (debts.length === 0) {
      console.log("Sin deudas registradas.");
    } else {
      const headers = ["Descripción", "Dirección", "Medio de pago", "Persona", "Importe total"];
      const rows = debts.map((d) => [
        d.descripcion,
        d.direccion,
        d.medioPago?.nombre ?? "-",
        d.persona?.nombre ?? "-",
        formatMoney(d.importe_total + d.ajuste_manual),
      ]);
      console.log("Deudas:\n");
      console.log(formatTable(headers, rows));
    }

    if (medioPagoTotals.length > 0) {
      const headers = ["Medio de pago", "Deuda total", "Pagado", "Resto"];
      const rows = medioPagoTotals.map((t) => [
        t.nombre,
        formatMoney(t.deuda_total),
        formatMoney(t.pagado),
        formatMoney(t.resto),
      ]);
      console.log("\nTotales por medio de pago:\n");
      console.log(formatTable(headers, rows));
    }

    if (personaTotals.length > 0) {
      const headers = ["Persona", "Me debe", "Le debo"];
      const rows = personaTotals.map((t) => [
        t.nombre,
        formatMoney(t.me_debe),
        formatMoney(t.le_debo),
      ]);
      console.log("\nTotales por persona:\n");
      console.log(formatTable(headers, rows));
    }
  });

// ── Comando deuda (mutaciones) ─────────────────────────────────────────────────

const deudaCmd = program.command("deuda").description("Crear, actualizar o eliminar deudas");

deudaCmd
  .command("crear")
  .description("Crear una deuda (genera sus cuotas automáticamente)")
  .requiredOption("--descripcion <texto>", "Descripción de la deuda")
  .requiredOption("--direccion <yo_debo|me_deben>", "Dirección de la deuda")
  .requiredOption("--importe <número>", "Importe total")
  .requiredOption("--cuotas <número>", "Cantidad de cuotas")
  .requiredOption("--fecha-inicio <YYYY-MM-DD>", "Fecha de la primera cuota")
  .option("--fecha <YYYY-MM-DD>", "Fecha de la deuda (default: igual a --fecha-inicio)")
  .option("--medio-pago-tag-id <número>", "ID del tag de medio de pago")
  .option("--concepto-tag-id <número>", "ID del tag de concepto")
  .option("--persona-tag-id <número>", "ID de tag de persona a asociar")
  .option("--ajuste-manual <número>", "Ajuste manual sobre el importe total")
  .option("--frecuencia <mensual|dias>", "Frecuencia de las cuotas", "mensual")
  .option("--frecuencia-dias <número>", "Días entre cuotas si --frecuencia dias")
  .option("--json", "Output en formato JSON")
  .action(
    (opts: {
      descripcion: string;
      direccion: string;
      importe: string;
      cuotas: string;
      fechaInicio: string;
      fecha?: string;
      medioPagoTagId?: string;
      conceptoTagId?: string;
      personaTagId?: string;
      ajusteManual?: string;
      frecuencia: string;
      frecuenciaDias?: string;
      json?: boolean;
    }) => {
      const created = createDebt({
        descripcion: opts.descripcion,
        direccion: parseDireccionDeuda(opts.direccion),
        importe_total: parseNumero("--importe", opts.importe),
        cant_cuotas: parseNumero("--cuotas", opts.cuotas),
        fecha: opts.fecha ?? opts.fechaInicio,
        fecha_inicio: opts.fechaInicio,
        frecuencia: parseFrecuencia(opts.frecuencia),
        ...(opts.medioPagoTagId !== undefined
          ? { medio_pago_tag_id: parseNumero("--medio-pago-tag-id", opts.medioPagoTagId) }
          : {}),
        ...(opts.conceptoTagId !== undefined
          ? { concepto_tag_id: parseNumero("--concepto-tag-id", opts.conceptoTagId) }
          : {}),
        ...(opts.personaTagId !== undefined
          ? { persona_tag_id: parseNumero("--persona-tag-id", opts.personaTagId) }
          : {}),
        ...(opts.ajusteManual !== undefined
          ? { ajuste_manual: parseNumero("--ajuste-manual", opts.ajusteManual) }
          : {}),
        ...(opts.frecuenciaDias !== undefined
          ? { frecuencia_dias: parseNumero("--frecuencia-dias", opts.frecuenciaDias) }
          : {}),
      });

      if (opts.json) {
        console.log(JSON.stringify(created, null, 2));
        return;
      }
      console.log(`Deuda #${created.id} creada: ${created.descripcion}`);
    }
  );

deudaCmd
  .command("editar <id>")
  .description("Editar una deuda existente (regenera cuotas pendientes si cambian los montos)")
  .option("--descripcion <texto>", "Nueva descripción")
  .option("--direccion <yo_debo|me_deben>", "Nueva dirección")
  .option("--importe <número>", "Nuevo importe total")
  .option("--cuotas <número>", "Nueva cantidad de cuotas")
  .option("--fecha-inicio <YYYY-MM-DD>", "Nueva fecha de la primera cuota")
  .option("--fecha <YYYY-MM-DD>", "Nueva fecha de la deuda")
  .option("--medio-pago-tag-id <número>", "Nuevo ID de tag de medio de pago")
  .option("--concepto-tag-id <número>", "Nuevo ID de tag de concepto")
  .option("--persona-tag-id <número>", "Nuevo ID de tag de persona")
  .option("--ajuste-manual <número>", "Nuevo ajuste manual")
  .option("--frecuencia <mensual|dias>", "Nueva frecuencia")
  .option("--frecuencia-dias <número>", "Nuevos días entre cuotas")
  .option("--json", "Output en formato JSON")
  .action(
    (
      id: string,
      opts: {
        descripcion?: string;
        direccion?: string;
        importe?: string;
        cuotas?: string;
        fechaInicio?: string;
        fecha?: string;
        medioPagoTagId?: string;
        conceptoTagId?: string;
        personaTagId?: string;
        ajusteManual?: string;
        frecuencia?: string;
        frecuenciaDias?: string;
        json?: boolean;
      }
    ) => {
      const debtId = parseNumero("id", id);
      const existing = getDebtById(debtId);
      if (!existing) throw new Error(`Deuda #${debtId} no encontrada`);

      const delta: Parameters<typeof updateDebt>[1] = {};
      if (opts.descripcion !== undefined) delta.descripcion = opts.descripcion;
      if (opts.direccion !== undefined) delta.direccion = parseDireccionDeuda(opts.direccion);
      if (opts.importe !== undefined) delta.importe_total = parseNumero("--importe", opts.importe);
      if (opts.cuotas !== undefined) delta.cant_cuotas = parseNumero("--cuotas", opts.cuotas);
      if (opts.fechaInicio !== undefined) delta.fecha_inicio = opts.fechaInicio;
      if (opts.fecha !== undefined) delta.fecha = opts.fecha;
      if (opts.medioPagoTagId !== undefined)
        delta.medio_pago_tag_id = parseNumero("--medio-pago-tag-id", opts.medioPagoTagId);
      if (opts.conceptoTagId !== undefined)
        delta.concepto_tag_id = parseNumero("--concepto-tag-id", opts.conceptoTagId);
      if (opts.personaTagId !== undefined)
        delta.persona_tag_id = parseNumero("--persona-tag-id", opts.personaTagId);
      if (opts.ajusteManual !== undefined)
        delta.ajuste_manual = parseNumero("--ajuste-manual", opts.ajusteManual);
      if (opts.frecuencia !== undefined) delta.frecuencia = parseFrecuencia(opts.frecuencia);
      if (opts.frecuenciaDias !== undefined)
        delta.frecuencia_dias = parseNumero("--frecuencia-dias", opts.frecuenciaDias);

      const updated = updateDebt(debtId, delta);

      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
        return;
      }
      console.log(`Deuda #${updated.id} actualizada.`);
    }
  );

deudaCmd
  .command("borrar <id>")
  .description("Eliminar una deuda (soft delete)")
  .option("--force", "Omitir confirmación interactiva")
  .option("--keep-movements", "Conservar los movimientos ligados (desvincula installment_id)")
  .option("--derivadas", "Eliminar también las deudas derivadas")
  .option("--json", "Output en formato JSON")
  .action(
    (
      id: string,
      opts: { force?: boolean; keepMovements?: boolean; derivadas?: boolean; json?: boolean }
    ) => {
      const debtId = parseNumero("id", id);
      const existing = getDebtById(debtId);
      if (!existing) throw new Error(`Deuda #${debtId} no encontrada`);

      if (!opts.force) {
        const respuesta = prompt(`¿Eliminar deuda #${debtId} "${existing.descripcion}"? (s/N): `);
        if (respuesta?.toLowerCase() !== "s" && respuesta?.toLowerCase() !== "y") {
          console.log("Operación cancelada.");
          return;
        }
      }

      deleteDebt(debtId, {
        deleteMovements: !opts.keepMovements,
        deleteDerived: opts.derivadas ?? false,
      });

      if (opts.json) {
        console.log(JSON.stringify({ eliminado: true, id: debtId }));
        return;
      }
      console.log(`Deuda #${debtId} "${existing.descripcion}" eliminada.`);
    }
  );

deudaCmd
  .command("compartir <id>")
  .description("Genera deudas derivadas (me_deben) por persona a partir de una deuda yo_debo")
  .requiredOption(
    "--split <persona_tag_id:importe>",
    "Persona e importe fijo asignado (repetible)",
    colectarRepetible,
    [] as string[]
  )
  .option("--json", "Output en formato JSON")
  .action((id: string, opts: { split: string[]; json?: boolean }) => {
    const debtId = parseNumero("id", id);
    const splits = opts.split.map((s) => {
      const [personaStr, importeStr] = s.split(":");
      if (!personaStr || !importeStr) {
        throw new Error(`--split inválido: "${s}" (esperado "persona_tag_id:importe")`);
      }
      return {
        persona_tag_id: parseNumero("--split persona_tag_id", personaStr),
        importe: parseNumero("--split importe", importeStr),
      };
    });

    const derivadas = shareDebt(debtId, splits);

    if (opts.json) {
      console.log(JSON.stringify(derivadas, null, 2));
      return;
    }
    console.log(`Deuda #${debtId} compartida en ${derivadas.length} derivada(s).`);
  });

// ── Comando cuota (mutaciones) ─────────────────────────────────────────────────

const cuotaCmd = program.command("cuota").description("Actualizar o pagar cuotas de una deuda");

cuotaCmd
  .command("pagar <id>")
  .description("Marcar una cuota como pagada")
  .option("--fecha <YYYY-MM-DD>", "Fecha de pago (default: fecha prevista de la cuota)")
  .option("--detalle <texto>", "Detalle del movimiento generado/actualizado")
  .option(
    "--tag <kind:nombre>",
    "Tag a asignar al movimiento ligado (repetible)",
    colectarRepetible,
    [] as string[]
  )
  .option("--json", "Output en formato JSON")
  .action(
    (id: string, opts: { fecha?: string; detalle?: string; tag: string[]; json?: boolean }) => {
      const installmentId = parseNumero("id", id);
      const existing = getInstallmentById(installmentId);
      if (!existing) throw new Error(`Cuota #${installmentId} no encontrada`);

      const tagPairs = parsearTagPairs(opts.tag);
      const tagsInput: TagsUpdateInput = {
        ...(tagPairs.tipo?.[0] !== undefined ? { tipo: tagPairs.tipo[0] } : {}),
        ...(tagPairs.estado?.[0] !== undefined ? { estado: tagPairs.estado[0] } : {}),
        ...(tagPairs.concepto !== undefined ? { concepto: tagPairs.concepto } : {}),
        ...(tagPairs.persona !== undefined ? { persona: tagPairs.persona } : {}),
        ...(tagPairs.medio_pago !== undefined ? { medio_pago: tagPairs.medio_pago } : {}),
      };
      const existingMovementTags = existing.movement_id
        ? (getMovementById(existing.movement_id)?.tags ?? [])
        : [];
      const { tagIds, skipped } = resolveTagsForUpdate(tagsInput, existingMovementTags);

      const updated = payInstallment(installmentId, {
        tagIds: tagIds ?? [],
        ...(opts.fecha !== undefined ? { fecha: opts.fecha } : {}),
        ...(opts.detalle !== undefined ? { detalle: opts.detalle } : {}),
      });
      reportarSkipped(skipped);

      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
        return;
      }
      console.log(`Cuota #${updated.id} marcada como pagada (fecha_pago=${updated.fecha_pago}).`);
    }
  );

cuotaCmd
  .command("editar <id>")
  .description("Editar campos de una cuota (importe, fecha prevista o estado)")
  .option("--importe <número>", "Nuevo importe")
  .option("--fecha-prevista <YYYY-MM-DD>", "Nueva fecha prevista")
  .option("--estado <pendiente|pagada>", "Nuevo estado")
  .option("--json", "Output en formato JSON")
  .action(
    (
      id: string,
      opts: { importe?: string; fechaPrevista?: string; estado?: string; json?: boolean }
    ) => {
      const installmentId = parseNumero("id", id);
      const existing = getInstallmentById(installmentId);
      if (!existing) throw new Error(`Cuota #${installmentId} no encontrada`);

      if (opts.estado !== undefined && opts.estado !== "pendiente" && opts.estado !== "pagada") {
        throw new Error(`--estado inválido: "${opts.estado}" (esperado "pendiente" o "pagada")`);
      }

      const updated = updateInstallment(installmentId, {
        ...(opts.importe !== undefined ? { importe: parseNumero("--importe", opts.importe) } : {}),
        ...(opts.fechaPrevista !== undefined ? { fecha_prevista: opts.fechaPrevista } : {}),
        ...(opts.estado !== undefined ? { estado: opts.estado } : {}),
      });

      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
        return;
      }
      console.log(`Cuota #${updated.id} actualizada.`);
    }
  );

// ── Comando movimiento ────────────────────────────────────────────────────────

/** Acumula valores de opciones repetibles (--tag, --clear). */
function colectarRepetible(valor: string, prev: string[]): string[] {
  return [...prev, valor];
}

/**
 * Parsea pares "kind:nombre" en un Record<kind, nombre[]>.
 * Lanza si el formato es inválido o el nombre está vacío.
 */
function parsearTagPairs(pairs: string[]): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const pair of pairs) {
    const sep = pair.indexOf(":");
    if (sep === -1) throw new Error(`Tag inválido "${pair}": formato esperado "kind:nombre"`);
    const kind = pair.slice(0, sep).trim();
    const nombre = pair.slice(sep + 1).trim();
    if (!nombre) throw new Error(`Tag "${pair}": nombre vacío`);
    if (!result[kind]) result[kind] = [];
    result[kind]?.push(nombre);
  }
  return result;
}

/** Imprime skipped si hay tags que no se encontraron. */
function reportarSkipped(skipped: string[]): void {
  if (skipped.length > 0) {
    console.warn(`Advertencia: tags no encontrados (ignorados): ${skipped.join(", ")}`);
  }
}

const movimientoCmd = program
  .command("movimiento")
  .description("Crear, actualizar, eliminar o importar movimientos");

// ── add ──────────────────────────────────────────────────────────────────────

movimientoCmd
  .command("add")
  .description("Crear un movimiento")
  .requiredOption("--fecha <YYYY-MM-DD>", "Fecha del movimiento")
  .requiredOption("--direccion <in|out>", "Dirección (in = ingreso, out = egreso)")
  .requiredOption("--monto <número>", "Monto total")
  .requiredOption("--detalle <texto>", "Descripción del movimiento")
  .option("--regla-op <div|mul|none>", "Regla de prorrateo", "none")
  .option("--regla-factor <número>", "Factor de la regla (requerido si regla-op != none)")
  .option("--observacion <texto>", "Observación adicional")
  .option("--tag <kind:nombre>", "Tag a asignar (repetible)", colectarRepetible, [] as string[])
  .option("--json", "Output en formato JSON")
  .addHelpText(
    "after",
    `
Ejemplos:
  mitarasca movimiento add --fecha 2026-06-20 --direccion out --monto 15000 --detalle "Netflix" \\
    --tag tipo:Fijo --tag estado:Adeudado --tag concepto:Suscripciones`
  )
  .action(
    (opts: {
      fecha: string;
      direccion: string;
      monto: string;
      detalle: string;
      reglaOp: string;
      reglaFactor?: string;
      observacion?: string;
      tag: string[];
      json?: boolean;
    }) => {
      const direccion = parseDireccionMovimiento(opts.direccion);
      const monto_total = Number(opts.monto);
      if (!Number.isFinite(monto_total) || monto_total <= 0) {
        throw new Error(`--monto inválido: "${opts.monto}" (debe ser un número positivo)`);
      }

      const regla_op = (() => {
        const v = opts.reglaOp;
        if (v !== "div" && v !== "mul" && v !== "none")
          throw new Error(`--regla-op inválido: "${v}" (esperado div, mul o none)`);
        return v;
      })();

      const regla_factor = opts.reglaFactor !== undefined ? Number(opts.reglaFactor) : null;
      if (opts.reglaFactor !== undefined && !Number.isFinite(regla_factor)) {
        throw new Error(`--regla-factor inválido: "${opts.reglaFactor}"`);
      }
      if (regla_op !== "none" && regla_factor == null) {
        throw new Error("--regla-factor es requerido cuando --regla-op es div o mul");
      }

      const tagPairs = parsearTagPairs(opts.tag);
      if (!tagPairs.tipo?.[0]) throw new Error("--tag tipo:<nombre> es requerido");
      if (!tagPairs.estado?.[0]) throw new Error("--tag estado:<nombre> es requerido");

      const tagsInput: TagsCreateInput = {
        tipo: tagPairs.tipo[0],
        estado: tagPairs.estado[0],
        ...(tagPairs.concepto !== undefined ? { concepto: tagPairs.concepto } : {}),
        ...(tagPairs.persona !== undefined ? { persona: tagPairs.persona } : {}),
        ...(tagPairs.medio_pago !== undefined ? { medio_pago: tagPairs.medio_pago } : {}),
      };
      const { tagIds, skipped } = resolveTagsForCreate(tagsInput);
      const created = createMovement(
        {
          fecha: opts.fecha,
          direccion,
          monto_total,
          regla_op,
          regla_factor,
          detalle: opts.detalle,
          observacion: opts.observacion ?? null,
        },
        tagIds
      );
      reportarSkipped(skipped);

      if (opts.json) {
        console.log(JSON.stringify(created, null, 2));
        return;
      }
      console.log(`Movimiento #${created.id} creado: ${created.detalle} (${created.fecha})`);
      console.log(
        formatTable(
          ["Campo", "Valor"],
          [
            ["Fecha", created.fecha],
            ["Dirección", created.direccion],
            ["Monto total", formatMoney(created.monto_total)],
            ["Monto efectivo", formatMoney(created.monto_efectivo)],
            ["Detalle", created.detalle],
            ["Tags", created.tags.map((t) => `${t.kind}:${t.nombre}`).join(", ") || "-"],
          ]
        )
      );
    }
  );

// ── update ────────────────────────────────────────────────────────────────────

movimientoCmd
  .command("update <id>")
  .description("Actualizar campos de un movimiento existente")
  .option("--fecha <YYYY-MM-DD>", "Nueva fecha")
  .option("--direccion <in|out>", "Nueva dirección")
  .option("--monto <número>", "Nuevo monto total")
  .option("--detalle <texto>", "Nueva descripción")
  .option("--regla-op <div|mul|none>", "Nueva regla de prorrateo")
  .option("--regla-factor <número>", "Nuevo factor de la regla")
  .option("--observacion <texto>", "Nueva observación")
  .option(
    "--tag <kind:nombre>",
    "Tag a asignar o reemplazar en ese kind (repetible)",
    colectarRepetible,
    [] as string[]
  )
  .option(
    "--clear <kind>",
    "Eliminar todos los tags de ese kind (repetible)",
    colectarRepetible,
    [] as string[]
  )
  .option("--json", "Output en formato JSON")
  .addHelpText(
    "after",
    `
Semántica de tags:
  --tag tipo:Fijo         → reemplaza el tipo por "Fijo"
  --tag concepto:Netflix  → reemplaza concepto con "Netflix"
  --clear concepto        → borra todos los tags de concepto
  Kinds no mencionados    → sin cambio`
  )
  .action(
    (
      id: string,
      opts: {
        fecha?: string;
        direccion?: string;
        monto?: string;
        detalle?: string;
        reglaOp?: string;
        reglaFactor?: string;
        observacion?: string;
        tag: string[];
        clear: string[];
        json?: boolean;
      }
    ) => {
      const movId = Number(id);
      if (!Number.isInteger(movId) || movId <= 0) throw new Error(`ID inválido: "${id}"`);

      const existing = getMovementById(movId);
      if (!existing) throw new Error(`Movimiento #${movId} no encontrado`);

      const delta: Parameters<typeof updateMovement>[1] = {};
      if (opts.fecha !== undefined) delta.fecha = opts.fecha;
      if (opts.direccion !== undefined) delta.direccion = parseDireccionMovimiento(opts.direccion);
      if (opts.monto !== undefined) {
        const v = Number(opts.monto);
        if (!Number.isFinite(v) || v <= 0) throw new Error(`--monto inválido: "${opts.monto}"`);
        delta.monto_total = v;
      }
      if (opts.detalle !== undefined) delta.detalle = opts.detalle;
      if (opts.reglaOp !== undefined) {
        const v = opts.reglaOp;
        if (v !== "div" && v !== "mul" && v !== "none")
          throw new Error(`--regla-op inválido: "${v}"`);
        delta.regla_op = v;
      }
      if (opts.reglaFactor !== undefined) {
        const v = Number(opts.reglaFactor);
        if (!Number.isFinite(v)) throw new Error(`--regla-factor inválido: "${opts.reglaFactor}"`);
        delta.regla_factor = v;
      }
      if (opts.observacion !== undefined) delta.observacion = opts.observacion;

      // Construir TagsUpdateInput si hay algún flag de tags
      const tagPairs = parsearTagPairs(opts.tag);
      const hasTags = opts.tag.length > 0 || opts.clear.length > 0;
      const tagsInput: TagsUpdateInput | undefined = hasTags
        ? {
            ...(tagPairs.tipo?.[0] !== undefined ? { tipo: tagPairs.tipo?.[0] } : {}),
            ...(tagPairs.estado?.[0] !== undefined ? { estado: tagPairs.estado?.[0] } : {}),
            ...(opts.clear.includes("concepto")
              ? { concepto: [] }
              : tagPairs.concepto !== undefined
                ? { concepto: tagPairs.concepto }
                : {}),
            ...(opts.clear.includes("persona")
              ? { persona: [] }
              : tagPairs.persona !== undefined
                ? { persona: tagPairs.persona }
                : {}),
            ...(opts.clear.includes("medio_pago")
              ? { medio_pago: [] }
              : tagPairs.medio_pago !== undefined
                ? { medio_pago: tagPairs.medio_pago }
                : {}),
          }
        : undefined;

      const { tagIds, skipped } = resolveTagsForUpdate(tagsInput, existing.tags);
      const updated = updateMovement(movId, delta, tagIds);
      reportarSkipped(skipped);

      if (opts.json) {
        console.log(JSON.stringify(updated, null, 2));
        return;
      }
      console.log(`Movimiento #${updated.id} actualizado.`);
      console.log(
        formatTable(
          ["Campo", "Valor"],
          [
            ["Fecha", updated.fecha],
            ["Dirección", updated.direccion],
            ["Monto efectivo", formatMoney(updated.monto_efectivo)],
            ["Detalle", updated.detalle],
            ["Tags", updated.tags.map((t) => `${t.kind}:${t.nombre}`).join(", ") || "-"],
          ]
        )
      );
    }
  );

// ── delete ────────────────────────────────────────────────────────────────────

movimientoCmd
  .command("delete <id>")
  .description("Eliminar un movimiento")
  .option("--force", "Omitir confirmación interactiva")
  .option("--json", "Output en formato JSON")
  .action((id: string, opts: { force?: boolean; json?: boolean }) => {
    const movId = Number(id);
    if (!Number.isInteger(movId) || movId <= 0) throw new Error(`ID inválido: "${id}"`);

    const existing = getMovementById(movId);
    if (!existing) throw new Error(`Movimiento #${movId} no encontrado`);

    if (!opts.force) {
      const respuesta = prompt(
        `¿Eliminar movimiento #${movId} "${existing.detalle}" (${existing.fecha}, ${formatMoney(existing.monto_efectivo)})? (s/N): `
      );
      if (respuesta?.toLowerCase() !== "s" && respuesta?.toLowerCase() !== "y") {
        console.log("Operación cancelada.");
        return;
      }
    }

    deleteMovement(movId);

    if (opts.json) {
      console.log(JSON.stringify({ eliminado: true, id: movId }));
      return;
    }
    console.log(`Movimiento #${movId} "${existing.detalle}" eliminado.`);
  });

// ── import ────────────────────────────────────────────────────────────────────

/** Schema Zod para validar el archivo JSON de importación. */
const movimientoImportSchema = z.array(
  z
    .object({
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD requerido"),
      direccion: z.enum(["in", "out"]),
      monto_total: z.number().positive(),
      detalle: z.string().min(1),
      regla_op: z.enum(["div", "mul", "none"]).optional(),
      regla_factor: z.number().positive().nullable().optional(),
      observacion: z.string().nullable().optional(),
      source_image_hash: z.string().nullable().optional(),
      tags: z.object({
        tipo: z.string().min(1),
        estado: z.string().min(1),
        concepto: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
        persona: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
        medio_pago: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
      }),
    })
    .refine((d) => !d.regla_op || d.regla_op === "none" || d.regla_factor != null, {
      message: "regla_factor requerido cuando regla_op es div o mul",
      path: ["regla_factor"],
    })
);

movimientoCmd
  .command("import <archivo>")
  .description("Importar movimientos desde un archivo JSON (array de objetos)")
  .option("--dry-run", "Validar y resolver tags sin escribir en la base de datos")
  .option("--json", "Output en formato JSON")
  .addHelpText(
    "after",
    `
El archivo debe ser un JSON array. Ejemplo:
  [
    { "fecha": "2026-06-01", "direccion": "out", "monto_total": 15000,
      "detalle": "Netflix", "tags": { "tipo": "Fijo", "estado": "Adeudado" } }
  ]`
  )
  .action(async (archivo: string, opts: { dryRun?: boolean; json?: boolean }) => {
    // Leer y parsear el archivo
    const contenido = await Bun.file(archivo)
      .json()
      .catch(() => {
        throw new Error(`No se pudo leer o parsear "${archivo}" como JSON`);
      });

    // Validar estructura
    const parseResult = movimientoImportSchema.safeParse(contenido);
    if (!parseResult.success) {
      const errores = parseResult.error.issues.map((e) => `  [${e.path.join(".")}] ${e.message}`);
      throw new Error(`JSON inválido:\n${errores.join("\n")}`);
    }
    const movimientos = parseResult.data;

    if (movimientos.length === 0) {
      console.log("Archivo vacío — nada que importar.");
      return;
    }

    // Filtro de invisibles: transferencias entre cuentas propias y demás
    // movimientos que no representan flujo real de dinero.
    const { visibles, invisibles } = partitionInvisibleCandidates(movimientos);
    if (invisibles.length > 0 && !opts.json) {
      console.warn(`\n${invisibles.length} movimiento(s) invisible(s) omitido(s):`);
      for (const { candidato, regla } of invisibles) {
        console.warn(
          `  ${candidato.fecha}  ${candidato.detalle}  (regla #${regla.id}: "${regla.patron}")`
        );
      }
    }

    // Resolver tags (fail-fast)
    const resolved: { input: (typeof movimientos)[0]; tagIds: number[]; skipped: string[] }[] = [];
    for (const [i, m] of visibles.entries()) {
      try {
        const tagsInput: TagsCreateInput = {
          tipo: m.tags.tipo,
          estado: m.tags.estado,
          ...(m.tags.concepto !== undefined ? { concepto: m.tags.concepto } : {}),
          ...(m.tags.persona !== undefined ? { persona: m.tags.persona } : {}),
          ...(m.tags.medio_pago !== undefined ? { medio_pago: m.tags.medio_pago } : {}),
        };
        const { tagIds, skipped } = resolveTagsForCreate(tagsInput);
        resolved.push({ input: m, tagIds, skipped });
      } catch (e) {
        throw new Error(`Fila ${i}: ${String(e)}`);
      }
    }

    // Nivel 1: cada candidato contra lo que ya está en la DB. No descarta nada —
    // dos movimientos idénticos pueden ser dos operaciones reales.
    const espejos: { indice: number; existentes: number[] }[] = [];
    for (const [i, r] of resolved.entries()) {
      const m = r.input;
      const hits = findExactInDb({
        fecha: m.fecha,
        direccion: m.direccion,
        monto_total: m.monto_total,
        detalle: m.detalle,
        regla_op: m.regla_op ?? "none",
        regla_factor: m.regla_factor ?? null,
        source_image_hash: m.source_image_hash ?? null,
      });
      if (hits.length > 0) {
        espejos.push({ indice: i, existentes: hits.map((h) => h.id) });
      }
    }

    if (opts.dryRun) {
      const resumen = resolved.map((r, i) => ({
        indice: i,
        fecha: r.input.fecha,
        direccion: r.input.direccion,
        monto_total: r.input.monto_total,
        detalle: r.input.detalle,
        tagIds: r.tagIds,
        skipped: r.skipped,
      }));
      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              dryRun: true,
              total: resumen.length,
              filas: resumen,
              invisibles: invisibles.map((i) => ({
                fecha: i.candidato.fecha,
                detalle: i.candidato.detalle,
                reglaId: i.regla.id,
                patron: i.regla.patron,
              })),
              espejos,
            },
            null,
            2
          )
        );
      } else {
        console.log(`[DRY-RUN] Se importarían ${resumen.length} movimiento(s):\n`);
        console.log(
          formatTable(
            ["#", "Fecha", "Dir.", "Monto", "Detalle", "Tags IDs"],
            resumen.map((r) => [
              String(r.indice),
              r.fecha,
              r.direccion,
              formatMoney(r.monto_total),
              r.detalle,
              r.tagIds.join(", ") || "-",
            ])
          )
        );
        const totalSkipped = resumen.flatMap((r) => r.skipped);
        if (totalSkipped.length > 0)
          console.warn(`\nTags no encontrados (serán ignorados): ${totalSkipped.join(", ")}`);
        if (espejos.length > 0) {
          console.warn(
            `\n${espejos.length} posible(s) duplicado(s) exacto(s) — se importarán igual:`
          );
          for (const e of espejos) {
            const m = resolved[e.indice]?.input;
            console.warn(
              `  #${e.indice} ${m?.fecha} ${m?.detalle} → ya existe como ${e.existentes.map((id) => `#${id}`).join(", ")}`
            );
          }
        }
      }
      return;
    }

    // Transacción
    const importedAt = new Date().toISOString();
    const ids: number[] = getDb().transaction((tx) => {
      const repo = makeMovementsRepo(tx as unknown as DbClient);
      return resolved.map((r, i) => {
        const m = r.input;
        const creado = repo.createMovement(
          {
            fecha: m.fecha,
            direccion: m.direccion,
            monto_total: m.monto_total,
            detalle: m.detalle,
            regla_op: m.regla_op ?? "none",
            regla_factor: m.regla_factor ?? null,
            observacion: m.observacion ?? null,
            imported_at: importedAt,
            source_image_hash: m.source_image_hash ?? null,
          },
          r.tagIds
        );

        const espejo = espejos.find((e) => e.indice === i);
        if (espejo) {
          for (const existenteId of espejo.existentes) {
            recordFinding({
              nivel: "exacto",
              movement_a_id: existenteId,
              movement_b_id: creado.id,
              motivo: "clave de identidad idéntica detectada durante el import",
            });
          }
        }

        return creado.id;
      });
    });

    const allSkipped = resolved.flatMap((r, i) => r.skipped.map((s) => `fila ${i}: ${s}`));
    if (opts.json) {
      console.log(JSON.stringify({ creados: ids.length, ids, skipped: allSkipped }, null, 2));
    } else {
      console.log(`\n${ids.length} movimiento(s) importado(s). IDs: ${ids.join(", ")}`);
      if (allSkipped.length > 0)
        console.warn(`Tags no encontrados (ignorados): ${allSkipped.join(", ")}`);
    }
  });

// ── Comando regla-invisible ──────────────────────────────────────────────────

function findInvisibleRule(id: number): InvisibleRule {
  const regla = listInvisibleRules().find((r) => r.id === id);
  if (!regla) throw new Error(`Regla invisible #${id} no encontrada`);
  return regla;
}

function describirRegla(r: InvisibleRule): string {
  return `#${r.id} "${r.patron}" (${r.modo}, ${r.direccion ?? "ambas"})`;
}

const reglaInvisibleCmd = program
  .command("regla-invisible")
  .description("Gestionar las reglas que excluyen movimientos del import (invisibles)");

reglaInvisibleCmd
  .command("listar")
  .description("Lista las reglas invisibles")
  .option("--activas", "mostrar solo las reglas activas")
  .option("--json", "imprimir salida en formato JSON")
  .addHelpText("after", `\n${DB_PATH_HELP}`)
  .action((opts: { activas?: boolean; json?: boolean }) => {
    const reglas = listInvisibleRules(opts.activas ?? false);

    if (opts.json) {
      console.log(JSON.stringify(reglas, null, 2));
      return;
    }
    if (reglas.length === 0) {
      console.log("Sin reglas invisibles.");
      return;
    }
    const headers = ["ID", "Patrón", "Modo", "Dirección", "Activa"];
    const rows = reglas.map((r) => [
      String(r.id),
      r.patron,
      r.modo,
      r.direccion ?? "ambas",
      r.activa ? "sí" : "no",
    ]);
    console.log(formatTable(headers, rows));
  });

reglaInvisibleCmd
  .command("crear")
  .description("Crea una regla invisible")
  .requiredOption("--patron <texto>", "Texto a comparar con el detalle del movimiento")
  .option("--modo <exacto|contiene>", "Cómo se compara el patrón", "exacto")
  .option("--direccion <in|out>", "Dirección a la que aplica (default: ambas)")
  .option("--inactiva", "Crear la regla desactivada")
  .option("--json", "Output en formato JSON")
  .action(
    (opts: {
      patron: string;
      modo: string;
      direccion?: string;
      inactiva?: boolean;
      json?: boolean;
    }) => {
      const patron = opts.patron.trim();
      if (patron === "") throw new Error("--patron no puede estar vacío");

      const regla = createInvisibleRule({
        patron,
        modo: parseModoInvisible(opts.modo),
        direccion: opts.direccion !== undefined ? parseDireccionMovimiento(opts.direccion) : null,
        activa: !opts.inactiva,
      });

      if (opts.json) {
        console.log(JSON.stringify(regla, null, 2));
        return;
      }
      console.log(`Regla invisible ${describirRegla(regla)} creada.`);
    }
  );

reglaInvisibleCmd
  .command("borrar <id>")
  .description("Elimina una regla invisible")
  .option("--force", "Omitir confirmación interactiva")
  .option("--json", "Output en formato JSON")
  .action((id: string, opts: { force?: boolean; json?: boolean }) => {
    const reglaId = parseNumero("id", id);
    const existing = findInvisibleRule(reglaId);

    if (!opts.force) {
      const respuesta = prompt(`¿Eliminar regla invisible ${describirRegla(existing)}? (s/N): `);
      if (respuesta?.toLowerCase() !== "s" && respuesta?.toLowerCase() !== "y") {
        console.log("Operación cancelada.");
        return;
      }
    }

    deleteInvisibleRule(reglaId);

    if (opts.json) {
      console.log(JSON.stringify({ eliminado: true, id: reglaId }));
      return;
    }
    console.log(`Regla invisible ${describirRegla(existing)} eliminada.`);
  });

for (const [nombre, activa] of [
  ["activar", true],
  ["desactivar", false],
] as const) {
  reglaInvisibleCmd
    .command(`${nombre} <id>`)
    .description(
      activa
        ? "Reactiva una regla invisible"
        : "Desactiva una regla invisible sin borrarla (deja de filtrar en el import)"
    )
    .option("--json", "Output en formato JSON")
    .action((id: string, opts: { json?: boolean }) => {
      const regla = setInvisibleRuleActiva(parseNumero("id", id), activa);

      if (opts.json) {
        console.log(JSON.stringify(regla, null, 2));
        return;
      }
      console.log(
        `Regla invisible ${describirRegla(regla)} ${activa ? "activada" : "desactivada"}.`
      );
    });
}

// ── Comando config ────────────────────────────────────────────────────────

const configCmd = program.command("config").description("Leer o escribir config de mitarasca");

configCmd
  .command("get [key]")
  .description("Muestra el config efectivo (o un valor puntual con notación de punto)")
  .option("--json", "Output en formato JSON")
  .action((key: string | undefined, opts: { json?: boolean }) => {
    const config = loadConfig();
    if (key) {
      const value = getConfigValue(config, key);
      if (opts.json) console.log(JSON.stringify({ [key]: value ?? null }));
      else console.log(value ?? "");
      return;
    }
    if (opts.json) console.log(JSON.stringify(config, null, 2));
    else console.log(JSON.stringify(config, null, 2));
  });

configCmd
  .command("set <key> <value>")
  .description("Escribe un valor de config (notación de punto: paths.inbox, ai.provider)")
  .option("--scope <scope>", "project | global", "global")
  .action((key: string, value: string, opts: { scope: string }) => {
    if (opts.scope !== "project" && opts.scope !== "global") {
      throw new Error(`--scope inválido: "${opts.scope}" (esperado "project" o "global")`);
    }
    const scope = opts.scope;
    const current = readScopedConfig(scope);
    const updated = setConfigValue(current, key, value);
    const path = writeConfigFile(scope, updated);
    console.log(`Escrito en ${path}`);
  });

configCmd
  .command("path")
  .description("Muestra las rutas de config de proyecto y global")
  .option("--json", "Output en formato JSON")
  .action((opts: { json?: boolean }) => {
    const paths = resolveConfigPath();
    if (opts.json) console.log(JSON.stringify(paths, null, 2));
    else {
      console.log(`project: ${paths.projectPath}`);
      console.log(`global:  ${paths.globalPath}`);
    }
  });

program
  .command("init")
  .description("Crea la DB por defecto (o la migra si ya existe)")
  .action(() => {
    if (process.env.MITARASCA_DEMO === "1") {
      console.log("En modo demo usá `mitarasca demo` (siembra la DB de demo y abre la web).");
      return;
    }
    ensureDb();
    console.log(`DB lista: ${resolveDbPath()}`);
  });

program
  .command("demo")
  .description("Siembra la DB de demo si falta y abre la web sobre ella")
  .option("--reseed", "Regenera la DB de demo desde cero")
  .option("--port <port>", "Puerto a usar", "3787")
  .action(async (opts: { reseed?: boolean; port: string }) => {
    process.env.MITARASCA_DEMO = "1";
    const dbPath = resolveDbPath();
    if (opts.reseed || !existsSync(dbPath)) {
      seedDemoDb(dbPath);
      console.log(`Demo generada: ${dbPath}`);
    }
    await startServer({ port: Number(opts.port), openBrowser: true });
  });

program
  .command("mcp")
  .description("Servidor MCP por stdio (para Claude Code, Claude Desktop u otro cliente MCP)")
  .action(async () => {
    // stdout es el canal JSON-RPC: nada de console.log acá.
    await import("@mitarasca/mcp");
  });

program
  .command("uninstall")
  .description("Quita el comando mitarasca del PATH; no borra datos, muestra dónde quedan")
  .action(() => {
    const { linkMsg, leftovers } = runUninstall({
      binPath: resolve(homedir(), ".local/bin/mitarasca"),
      cliEntry: new URL(import.meta.url).pathname,
    });
    console.log(linkMsg);
    if (leftovers.length === 0) return;
    console.log("\nQuedan estos datos y configs (no se borraron):");
    for (const p of leftovers) console.log(`  ${p}`);
    console.log("\nPara borrarlos:");
    for (const p of leftovers) console.log(`  rm -rf ${JSON.stringify(p)}`);
  });

program
  .command("ui")
  .alias("web")
  .description("Levanta el servidor y abre el navegador")
  .option("--port <port>", "Puerto a usar", "3787")
  .action(async (opts: { port: string }) => {
    await startServer({ port: Number(opts.port), openBrowser: true });
  });

program
  .command("serve")
  .description("Levanta el servidor en foreground sin abrir navegador (uso con systemd)")
  .option("--port <port>", "Puerto a usar", "3787")
  .action(async (opts: { port: string }) => {
    await startServer({ port: Number(opts.port), openBrowser: false });
  });

program
  .command("install")
  .description("Instalador interactivo: config, skill, harnesses de IA")
  .option("--yes", "No interactivo, usa defaults")
  .option("--scope <scope>", "project | global")
  .option("--harnesses <list>", "Lista separada por coma: claude,codex")
  .option("--provider <provider>", "anthropic | google | openai")
  .option("--model <model>", "Modelo a usar")
  .option("--db-path <path>", "Path explícito de la DB")
  .option("--force", "Autoriza backup + sobreescritura de un config existente")
  .option("--link", "Corre `bun link` al finalizar para exponer el binario en el shell")
  .action(
    async (opts: {
      yes?: boolean;
      scope?: string;
      harnesses?: string;
      provider?: string;
      model?: string;
      dbPath?: string;
      force?: boolean;
      link?: boolean;
    }) => {
      const skillSourceDir =
        process.env.MITARASCA_INSTALLED === "1"
          ? new URL("assets/skills/importar-movimientos", import.meta.url).pathname
          : new URL("../assets/skills/importar-movimientos", import.meta.url).pathname;
      const flags: InstallFlags = {
        ...(opts.yes !== undefined && { yes: opts.yes }),
        ...(opts.scope !== undefined && { scope: opts.scope as "project" | "global" }),
        ...(opts.harnesses !== undefined && { harnesses: opts.harnesses }),
        ...(opts.provider !== undefined && { provider: opts.provider }),
        ...(opts.model !== undefined && { model: opts.model }),
        ...(opts.dbPath !== undefined && { dbPath: opts.dbPath }),
        ...(opts.force !== undefined && { force: opts.force }),
        ...(opts.link !== undefined && { link: opts.link }),
      };
      const result = await runInstall(flags, {
        cwd: process.cwd(),
        home: homedir(),
        skillSourceDir,
        cliPackageDir: new URL("..", import.meta.url).pathname,
      });
      console.log(`\nConfig escrito en ${result.configPath}`);
      for (const p of result.skillPaths) console.log(`Skill copiada a ${p}`);
      console.log(
        "\nSi instalaste con bunx sin --global, recordá correr: bun add -g @lucianodlf/mitarasca"
      );
    }
  );

program.parseAsync().catch((err: unknown) => {
  if (process.env.MITARASCA_DEBUG === "1") console.error(err);
  else console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
