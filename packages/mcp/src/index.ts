import {
  type DbClient,
  buildFinancialReport,
  createDebt,
  createMovement,
  deleteDebt,
  deleteMovement,
  getDb,
  getDebtById,
  getInstallmentById,
  getMovementById,
  getYearBalanceWithEstimate,
  listDebts,
  listDerivedDebts,
  listInstallmentsByDebt,
  listMovementsByDateRange,
  makeMovementsRepo,
  payInstallment,
  projectInstallmentsByMonth,
  renderReportMarkdown,
  shareDebt,
  summarizeByMonth,
  summarizeByYear,
  totalsByMedioPago,
  totalsByPersonaBidireccional,
  updateDebt,
  updateInstallment,
  updateMovement,
} from "@mitarasca/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { currentYearMonth, monthRange } from "./lib/dates.js";
import { resolveTagsForCreate, resolveTagsForUpdate } from "./lib/tags.js";
import type { TagsCreateInput, TagsUpdateInput } from "./lib/tags.js";

const server = new McpServer({
  name: "mitarasca",
  version: "0.1.0",
});

/** Envuelve cualquier dato en la respuesta JSON-como-texto que esperan los clientes MCP. */
function jsonResult(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const modo = z.enum(["proyectado", "real"]);
const direccionMovimiento = z.enum(["in", "out"]);
const direccionDeuda = z.enum(["yo_debo", "me_deben"]);
const frecuenciaDeuda = z.enum(["mensual", "dias"]);
const installmentEstado = z.enum(["pendiente", "pagada"]);

// ── Schemas para mutaciones de movimientos ────────────────────────────────────

const tagsCreateSchema = z.object({
  tipo: z.string().min(1),
  estado: z.string().min(1),
  concepto: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  persona: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  medio_pago: z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
});

const tagsUpdateSchema = z
  .object({
    tipo: z.string().min(1).optional(),
    estado: z.string().min(1).optional(),
    concepto: z
      .union([z.string().min(1), z.array(z.string())])
      .nullable()
      .optional(),
    persona: z
      .union([z.string().min(1), z.array(z.string())])
      .nullable()
      .optional(),
    medio_pago: z
      .union([z.string().min(1), z.array(z.string())])
      .nullable()
      .optional(),
  })
  .optional();

/** Schema completo de un movimiento para crear — reutilizado en batch. */
const movimientoItemSchema = z
  .object({
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD requerido"),
    direccion: direccionMovimiento,
    monto_total: z.number().positive(),
    detalle: z.string().min(1),
    regla_op: z.enum(["div", "mul", "none"]).optional(),
    regla_factor: z.number().positive().nullable().optional(),
    observacion: z.string().nullable().optional(),
    tags: tagsCreateSchema,
  })
  .refine((d) => !d.regla_op || d.regla_op === "none" || d.regla_factor != null, {
    message: "regla_factor requerido cuando regla_op es div o mul",
    path: ["regla_factor"],
  });

server.registerTool(
  "listar_movimientos",
  {
    description:
      "Lista movimientos en un rango de fechas (default: mes actual), opcionalmente filtrados por dirección (in = ingreso, out = egreso). Cada movimiento incluye sus tags.",
    inputSchema: {
      direccion: direccionMovimiento.optional(),
      desde: z.string().optional(),
      hasta: z.string().optional(),
    },
  },
  ({ direccion, desde, hasta }) => {
    let from = desde;
    let to = hasta;
    if (!from || !to) {
      const { year, month } = currentYearMonth();
      const range = monthRange(year, month);
      from ??= range.from;
      to ??= range.to;
    }
    const movimientos = listMovementsByDateRange(from, to);
    const filtrados = direccion
      ? movimientos.filter((m) => m.direccion === direccion)
      : movimientos;
    return jsonResult(filtrados);
  }
);

server.registerTool(
  "resumen_mensual",
  {
    description:
      "Resumen de ingresos, egresos y balance de un mes (year + month 1-12). mode proyectado (default) o real.",
    inputSchema: {
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
      mode: modo.optional(),
    },
  },
  ({ year, month, mode }) => jsonResult(summarizeByMonth(year, month, mode ?? "proyectado"))
);

server.registerTool(
  "informe_financiero",
  {
    description:
      "Informe resumen: ingresos/egresos por mes y por concepto, balance mensual, promedios y meses evaluados. desde/hasta en YYYY-MM (default: todos los meses con datos). modo real (default, solo Pagado) o proyectado. formato json (default) o md.",
    inputSchema: {
      desde: z.string().optional(),
      hasta: z.string().optional(),
      modo: modo.optional(),
      formato: z.enum(["json", "md"]).optional(),
    },
  },
  ({ desde, hasta, modo: modoInforme, formato }) => {
    const report = buildFinancialReport({
      modo: modoInforme ?? "real",
      ...(desde !== undefined ? { desde } : {}),
      ...(hasta !== undefined ? { hasta } : {}),
    });
    if (formato === "md") {
      return { content: [{ type: "text" as const, text: renderReportMarkdown(report) }] };
    }
    return jsonResult(report);
  }
);

server.registerTool(
  "balance_anual",
  {
    description:
      "Balance anual con los 12 meses. mode proyectado (default) o real. Si estimar_variables es true, incluye estimación de gastos variables.",
    inputSchema: {
      year: z.number().int(),
      mode: modo.optional(),
      estimar_variables: z.boolean().optional(),
    },
  },
  ({ year, mode, estimar_variables }) => {
    const m = mode ?? "proyectado";
    const data = estimar_variables
      ? getYearBalanceWithEstimate(year, m, { includeVariableEstimate: true })
      : summarizeByYear(year, m);
    return jsonResult(data);
  }
);

server.registerTool(
  "listar_deudas",
  {
    description:
      "Lista deudas (opcionalmente filtradas por dirección: yo_debo o me_deben) junto con totales por medio de pago y por persona (bidireccional: me_debe/le_debo). El filtro de dirección solo afecta la lista de deudas, no los totales.",
    inputSchema: {
      direccion: direccionDeuda.optional(),
    },
  },
  ({ direccion }) =>
    jsonResult({
      deudas: listDebts(direccion),
      totalesPorMedioPago: totalsByMedioPago(),
      totalesPorPersona: totalsByPersonaBidireccional(),
    })
);

server.registerTool(
  "listar_deudas_derivadas",
  {
    description:
      "Lista las deudas derivadas (me_deben, una por persona) generadas a partir de una deuda padre yo_debo compartida.",
    inputSchema: {
      parentId: z.number().int(),
    },
  },
  ({ parentId }) => jsonResult(listDerivedDebts(parentId))
);

server.registerTool(
  "cuotas_por_deuda",
  {
    description: "Lista las cuotas (installments) de una deuda por su id.",
    inputSchema: {
      debtId: z.number().int(),
    },
  },
  ({ debtId }) => jsonResult(listInstallmentsByDebt(debtId))
);

server.registerTool(
  "proyeccion_cuotas_mes",
  {
    description:
      "Proyección de cuotas a pagar/cobrar en un mes (year + month 1-12), agrupada por medio de pago.",
    inputSchema: {
      year: z.number().int(),
      month: z.number().int().min(1).max(12),
    },
  },
  ({ year, month }) => jsonResult(projectInstallmentsByMonth(year, month))
);

// ── Mutaciones de movimientos ─────────────────────────────────────────────────

server.registerTool(
  "crear_movimiento",
  {
    description:
      "Crea un movimiento (ingreso o egreso). tags.tipo y tags.estado son obligatorios. " +
      "tags.concepto/persona/medio_pago son opcionales (string o array de strings).",
    inputSchema: {
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
      direccion: direccionMovimiento,
      monto_total: z.number().positive(),
      detalle: z.string().min(1),
      regla_op: z.enum(["div", "mul", "none"]).optional(),
      regla_factor: z.number().positive().nullable().optional(),
      observacion: z.string().nullable().optional(),
      tags: tagsCreateSchema,
    },
  },
  (input) => {
    const tagsInput: TagsCreateInput = {
      tipo: input.tags.tipo,
      estado: input.tags.estado,
      ...(input.tags.concepto !== undefined ? { concepto: input.tags.concepto } : {}),
      ...(input.tags.persona !== undefined ? { persona: input.tags.persona } : {}),
      ...(input.tags.medio_pago !== undefined ? { medio_pago: input.tags.medio_pago } : {}),
    };
    const { tagIds, skipped } = resolveTagsForCreate(tagsInput);
    const created = createMovement(
      {
        fecha: input.fecha,
        direccion: input.direccion,
        monto_total: input.monto_total,
        detalle: input.detalle,
        regla_op: input.regla_op ?? "none",
        regla_factor: input.regla_factor ?? null,
        observacion: input.observacion ?? null,
      },
      tagIds
    );
    return jsonResult({ movimiento: created, skipped });
  }
);

server.registerTool(
  "actualizar_movimiento",
  {
    description:
      "Actualiza campos de un movimiento existente. Solo se modifican los campos enviados. " +
      "En tags: omitido = sin cambio; [] = borrar ese kind; valor = reemplazar.",
    inputSchema: {
      id: z.number().int().positive(),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      direccion: direccionMovimiento.optional(),
      monto_total: z.number().positive().optional(),
      detalle: z.string().min(1).optional(),
      regla_op: z.enum(["div", "mul", "none"]).optional(),
      regla_factor: z.number().positive().nullable().optional(),
      observacion: z.string().nullable().optional(),
      tags: tagsUpdateSchema,
    },
  },
  (input) => {
    const existing = getMovementById(input.id);
    if (!existing) return jsonResult({ error: `Movimiento #${input.id} no encontrado` });

    const tagsInput: TagsUpdateInput | undefined = input.tags
      ? {
          ...(input.tags.tipo !== undefined ? { tipo: input.tags.tipo } : {}),
          ...(input.tags.estado !== undefined ? { estado: input.tags.estado } : {}),
          ...(input.tags.concepto !== undefined ? { concepto: input.tags.concepto } : {}),
          ...(input.tags.persona !== undefined ? { persona: input.tags.persona } : {}),
          ...(input.tags.medio_pago !== undefined ? { medio_pago: input.tags.medio_pago } : {}),
        }
      : undefined;
    const { tagIds, skipped } = resolveTagsForUpdate(tagsInput, existing.tags);

    const delta: Parameters<typeof updateMovement>[1] = {};
    if (input.fecha !== undefined) delta.fecha = input.fecha;
    if (input.direccion !== undefined) delta.direccion = input.direccion;
    if (input.monto_total !== undefined) delta.monto_total = input.monto_total;
    if (input.detalle !== undefined) delta.detalle = input.detalle;
    if (input.regla_op !== undefined) delta.regla_op = input.regla_op;
    if ("regla_factor" in input) delta.regla_factor = input.regla_factor ?? null;
    if ("observacion" in input) delta.observacion = input.observacion ?? null;

    const updated = updateMovement(input.id, delta, tagIds);
    return jsonResult({ movimiento: updated, skipped });
  }
);

server.registerTool(
  "eliminar_movimiento",
  {
    description: "Elimina un movimiento por ID. Retorna el movimiento eliminado como confirmación.",
    inputSchema: {
      id: z.number().int().positive(),
    },
  },
  ({ id }) => {
    const existing = getMovementById(id);
    if (!existing) return jsonResult({ error: `Movimiento #${id} no encontrado` });
    deleteMovement(id);
    return jsonResult({ eliminado: true, movimiento: existing });
  }
);

server.registerTool(
  "importar_movimientos",
  {
    description:
      "Importa un lote de movimientos en una transacción atómica (todo-o-nada). " +
      "Si cualquier fila falla, se revierte todo y se retorna el índice del error.",
    inputSchema: {
      movimientos: z.array(movimientoItemSchema),
    },
  },
  ({ movimientos }) => {
    if (movimientos.length === 0) return jsonResult({ creados: 0, ids: [] });

    // Resolver todos los tags antes de abrir la transacción (fail-fast)
    const resolved: { input: (typeof movimientos)[0]; tagIds: number[]; skipped: string[] }[] = [];
    for (const [i, m] of movimientos.entries()) {
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
        return jsonResult({ error: { indice: i, mensaje: String(e) } });
      }
    }

    // Ejecutar en transacción
    let currentIdx = -1;
    try {
      const ids = getDb().transaction((tx) => {
        const repo = makeMovementsRepo(tx as unknown as DbClient);
        return resolved.map((r, i) => {
          currentIdx = i;
          const m = r.input;
          return repo.createMovement(
            {
              fecha: m.fecha,
              direccion: m.direccion,
              monto_total: m.monto_total,
              detalle: m.detalle,
              regla_op: m.regla_op ?? "none",
              regla_factor: m.regla_factor ?? null,
              observacion: m.observacion ?? null,
            },
            r.tagIds
          ).id;
        });
      });

      const allSkipped = resolved.flatMap((r, i) => r.skipped.map((s) => ({ indice: i, tag: s })));
      return jsonResult({ creados: ids.length, ids, skipped: allSkipped });
    } catch (e) {
      return jsonResult({ error: { indice: currentIdx, mensaje: String(e) } });
    }
  }
);

// ── Mutaciones de deudas y cuotas ──────────────────────────────────────────────

server.registerTool(
  "crear_deuda",
  {
    description:
      "Crea una deuda (yo_debo o me_deben) y genera automáticamente sus cuotas según cant_cuotas/frecuencia.",
    inputSchema: {
      descripcion: z.string().min(1),
      direccion: direccionDeuda,
      importe_total: z.number().positive(),
      cant_cuotas: z.number().int().positive(),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
        .optional()
        .describe("Fecha de la deuda (default: igual a fecha_inicio)"),
      fecha_inicio: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
        .describe("Fecha de la primera cuota"),
      medio_pago_tag_id: z.number().int().nullable().optional(),
      concepto_tag_id: z.number().int().nullable().optional(),
      persona_tag_id: z.number().int().nullable().optional(),
      ajuste_manual: z.number().optional(),
      frecuencia: frecuenciaDeuda.optional(),
      frecuencia_dias: z.number().int().positive().nullable().optional(),
    },
  },
  (input) => {
    const created = createDebt({
      descripcion: input.descripcion,
      direccion: input.direccion,
      importe_total: input.importe_total,
      cant_cuotas: input.cant_cuotas,
      fecha: input.fecha ?? input.fecha_inicio,
      fecha_inicio: input.fecha_inicio,
      ...(input.medio_pago_tag_id !== undefined
        ? { medio_pago_tag_id: input.medio_pago_tag_id }
        : {}),
      ...(input.concepto_tag_id !== undefined ? { concepto_tag_id: input.concepto_tag_id } : {}),
      ...(input.persona_tag_id !== undefined ? { persona_tag_id: input.persona_tag_id } : {}),
      ...(input.ajuste_manual !== undefined ? { ajuste_manual: input.ajuste_manual } : {}),
      ...(input.frecuencia !== undefined ? { frecuencia: input.frecuencia } : {}),
      ...(input.frecuencia_dias !== undefined ? { frecuencia_dias: input.frecuencia_dias } : {}),
    });
    return jsonResult(created);
  }
);

server.registerTool(
  "editar_deuda",
  {
    description:
      "Edita una deuda existente. Cambios en importe_total/cant_cuotas/fecha_inicio/frecuencia/direccion regeneran las cuotas pendientes (las pagadas se preservan).",
    inputSchema: {
      id: z.number().int().positive(),
      descripcion: z.string().min(1).optional(),
      direccion: direccionDeuda.optional(),
      importe_total: z.number().positive().optional(),
      cant_cuotas: z.number().int().positive().optional(),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      fecha_inicio: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      medio_pago_tag_id: z.number().int().nullable().optional(),
      concepto_tag_id: z.number().int().nullable().optional(),
      persona_tag_id: z.number().int().nullable().optional(),
      ajuste_manual: z.number().optional(),
      frecuencia: frecuenciaDeuda.optional(),
      frecuencia_dias: z.number().int().positive().nullable().optional(),
    },
    annotations: { destructiveHint: true },
  },
  ({ id, ...data }) => {
    const existing = getDebtById(id);
    if (!existing) return jsonResult({ error: `Deuda #${id} no encontrada` });

    const delta: Parameters<typeof updateDebt>[1] = {};
    if (data.descripcion !== undefined) delta.descripcion = data.descripcion;
    if (data.direccion !== undefined) delta.direccion = data.direccion;
    if (data.importe_total !== undefined) delta.importe_total = data.importe_total;
    if (data.cant_cuotas !== undefined) delta.cant_cuotas = data.cant_cuotas;
    if (data.fecha !== undefined) delta.fecha = data.fecha;
    if (data.fecha_inicio !== undefined) delta.fecha_inicio = data.fecha_inicio;
    if ("medio_pago_tag_id" in data) delta.medio_pago_tag_id = data.medio_pago_tag_id ?? null;
    if ("concepto_tag_id" in data) delta.concepto_tag_id = data.concepto_tag_id ?? null;
    if ("persona_tag_id" in data) delta.persona_tag_id = data.persona_tag_id ?? null;
    if (data.ajuste_manual !== undefined) delta.ajuste_manual = data.ajuste_manual;
    if (data.frecuencia !== undefined) delta.frecuencia = data.frecuencia;
    if ("frecuencia_dias" in data) delta.frecuencia_dias = data.frecuencia_dias ?? null;

    const updated = updateDebt(id, delta);
    return jsonResult(updated);
  }
);

server.registerTool(
  "borrar_deuda",
  {
    description:
      "Elimina una deuda (soft delete). Por defecto borra físicamente sus cuotas y los movimientos ligados; eliminar_movimientos:false los conserva desvinculando installment_id. eliminar_derivadas:true borra también sus deudas derivadas (compartidas).",
    inputSchema: {
      id: z.number().int().positive(),
      eliminar_movimientos: z.boolean().optional(),
      eliminar_derivadas: z.boolean().optional(),
    },
    annotations: { destructiveHint: true },
  },
  ({ id, eliminar_movimientos, eliminar_derivadas }) => {
    const existing = getDebtById(id);
    if (!existing) return jsonResult({ error: `Deuda #${id} no encontrada` });
    deleteDebt(id, {
      ...(eliminar_movimientos !== undefined ? { deleteMovements: eliminar_movimientos } : {}),
      ...(eliminar_derivadas !== undefined ? { deleteDerived: eliminar_derivadas } : {}),
    });
    return jsonResult({ eliminado: true, deuda: existing });
  }
);

server.registerTool(
  "compartir_deuda",
  {
    description:
      "Genera deudas derivadas (me_deben) por persona a partir de una deuda padre yo_debo. Cada split requiere persona_tag_id y exactamente uno de importe o porcentaje. La suma no puede exceder el importe_total del padre.",
    inputSchema: {
      parentId: z.number().int().positive(),
      splits: z
        .array(
          z.object({
            persona_tag_id: z.number().int(),
            importe: z.number().positive().optional(),
            porcentaje: z.number().positive().max(100).optional(),
            medio_pago_tag_id: z.number().int().nullable().optional(),
          })
        )
        .min(1),
    },
    annotations: { destructiveHint: true },
  },
  ({ parentId, splits }) =>
    jsonResult(
      shareDebt(
        parentId,
        splits.map((s) => ({
          persona_tag_id: s.persona_tag_id,
          ...(s.importe !== undefined ? { importe: s.importe } : {}),
          ...(s.porcentaje !== undefined ? { porcentaje: s.porcentaje } : {}),
          ...(s.medio_pago_tag_id !== undefined ? { medio_pago_tag_id: s.medio_pago_tag_id } : {}),
        }))
      )
    )
);

server.registerTool(
  "editar_cuota",
  {
    description: "Edita importe, fecha prevista o estado de una cuota existente.",
    inputSchema: {
      id: z.number().int().positive(),
      importe: z.number().positive().optional(),
      fecha_prevista: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      estado: installmentEstado.optional(),
    },
    annotations: { destructiveHint: true },
  },
  ({ id, ...data }) => {
    const existing = getInstallmentById(id);
    if (!existing) return jsonResult({ error: `Cuota #${id} no encontrada` });

    const delta: Parameters<typeof updateInstallment>[1] = {};
    if (data.importe !== undefined) delta.importe = data.importe;
    if (data.fecha_prevista !== undefined) delta.fecha_prevista = data.fecha_prevista;
    if (data.estado !== undefined) delta.estado = data.estado;

    const updated = updateInstallment(id, delta);
    return jsonResult(updated);
  }
);

server.registerTool(
  "pagar_cuota",
  {
    description:
      "Marca una cuota como pagada. Si la cuota ya tiene un movimiento ligado, lo actualiza; si no, crea uno nuevo. tags sigue la misma semántica que actualizar_movimiento.",
    inputSchema: {
      id: z.number().int().positive(),
      fecha: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
      detalle: z.string().min(1).optional(),
      tags: tagsUpdateSchema,
    },
    annotations: { destructiveHint: true },
  },
  ({ id, fecha, detalle, tags }) => {
    const existing = getInstallmentById(id);
    if (!existing) return jsonResult({ error: `Cuota #${id} no encontrada` });

    const tagsInput: TagsUpdateInput | undefined = tags
      ? {
          ...(tags.tipo !== undefined ? { tipo: tags.tipo } : {}),
          ...(tags.estado !== undefined ? { estado: tags.estado } : {}),
          ...(tags.concepto !== undefined ? { concepto: tags.concepto } : {}),
          ...(tags.persona !== undefined ? { persona: tags.persona } : {}),
          ...(tags.medio_pago !== undefined ? { medio_pago: tags.medio_pago } : {}),
        }
      : undefined;
    const existingMovementTags = existing.movement_id
      ? (getMovementById(existing.movement_id)?.tags ?? [])
      : [];
    const { tagIds, skipped } = resolveTagsForUpdate(tagsInput, existingMovementTags);

    const updated = payInstallment(id, {
      tagIds: tagIds ?? [],
      ...(fecha !== undefined ? { fecha } : {}),
      ...(detalle !== undefined ? { detalle } : {}),
    });
    return jsonResult({ cuota: updated, skipped });
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
