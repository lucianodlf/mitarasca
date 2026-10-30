import { z } from "zod";
import { stripUndefined } from "../strip-undefined.js";
import { publicProcedure, router } from "../trpc.js";

const direccion = z.enum(["yo_debo", "me_deben"]);
const frecuencia = z.enum(["mensual", "dias"]);
const installmentEstado = z.enum(["pendiente", "pagada"]);

const createDebtInput = z.object({
  descripcion: z.string(),
  direccion,
  medio_pago_tag_id: z.number().nullable().optional(),
  concepto_tag_id: z.number().nullable().optional(),
  persona_tag_id: z.number().nullable().optional(),
  importe_total: z.number(),
  cant_cuotas: z.number(),
  ajuste_manual: z.number().optional(),
  fecha: z.string(),
  fecha_inicio: z.string(),
  frecuencia: frecuencia.optional(),
  frecuencia_dias: z.number().nullable().optional(),
  observacion: z.string().nullable().optional(),
});

const updateDebtInput = z.object({
  id: z.number(),
  data: createDebtInput.partial(),
});

const updateInstallmentInput = z.object({
  id: z.number(),
  data: z.object({
    importe: z.number().optional(),
    fecha_prevista: z.string().optional(),
    estado: installmentEstado.optional(),
    observacion: z.string().nullable().optional(),
    propagarAMovimiento: z.boolean().optional(),
  }),
});

const payInstallmentInput = z.object({
  id: z.number(),
  data: z.object({
    fecha: z.string().optional(),
    tagIds: z.array(z.number()),
    detalle: z.string().optional(),
  }),
});

const shareSplitInput = z.object({
  persona_tag_id: z.number(),
  importe: z.number().positive().optional(),
  porcentaje: z.number().positive().max(100).optional(),
  medio_pago_tag_id: z.number().nullable().optional(),
});

const shareDebtInput = z.object({
  parentId: z.number(),
  splits: z.array(shareSplitInput).min(1),
});

export const debtsRouter = router({
  list: publicProcedure
    .input(z.object({ direccion: direccion.optional() }).optional())
    .query(({ ctx, input }) => ctx.debts.listDebts(input?.direccion)),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => ctx.debts.getDebtById(input.id)),

  totalsByMedioPago: publicProcedure.query(({ ctx }) => ctx.debts.totalsByMedioPago()),

  totalsByPersona: publicProcedure.query(({ ctx }) => ctx.debts.totalsByPersonaBidireccional()),

  derivedDebts: publicProcedure
    .input(z.object({ parentId: z.number() }))
    .query(({ ctx, input }) => ctx.debts.listDerivedDebts(input.parentId)),

  installmentsByDebt: publicProcedure
    .input(z.object({ debtId: z.number() }))
    .query(({ ctx, input }) => ctx.installments.listInstallmentsByDebt(input.debtId)),

  installmentById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => ctx.installments.getInstallmentById(input.id)),

  projectByMonth: publicProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .query(({ ctx, input }) =>
      ctx.installments.projectInstallmentsByMonth(input.year, input.month)
    ),

  create: publicProcedure
    .input(createDebtInput)
    .mutation(({ ctx, input }) => ctx.debts.createDebt(stripUndefined(input))),

  update: publicProcedure
    .input(updateDebtInput)
    .mutation(({ ctx, input }) => ctx.debts.updateDebt(input.id, stripUndefined(input.data))),

  delete: publicProcedure
    .input(
      z.object({
        id: z.number(),
        deleteMovements: z.boolean().optional(),
        deleteDerived: z.boolean().optional(),
      })
    )
    .mutation(({ ctx, input }) => {
      ctx.debts.deleteDebt(input.id, {
        ...(input.deleteMovements !== undefined ? { deleteMovements: input.deleteMovements } : {}),
        ...(input.deleteDerived !== undefined ? { deleteDerived: input.deleteDerived } : {}),
      });
      return { id: input.id };
    }),

  share: publicProcedure.input(shareDebtInput).mutation(({ ctx, input }) =>
    ctx.debts.shareDebt(
      input.parentId,
      input.splits.map((s) => stripUndefined(s))
    )
  ),

  updateInstallment: publicProcedure
    .input(updateInstallmentInput)
    .mutation(({ ctx, input }) =>
      ctx.installments.updateInstallment(input.id, stripUndefined(input.data))
    ),

  payInstallment: publicProcedure
    .input(payInstallmentInput)
    .mutation(({ ctx, input }) =>
      ctx.installments.payInstallment(input.id, stripUndefined(input.data))
    ),

  toggleInstallmentEstado: publicProcedure
    .input(z.object({ id: z.number(), fecha: z.string().optional() }))
    .mutation(({ ctx, input }) => ctx.installments.toggleInstallmentEstado(input.id, input.fecha)),

  rescheduleInstallments: publicProcedure
    .input(z.object({ debtId: z.number(), fechaInicio: z.string() }))
    .mutation(({ ctx, input }) =>
      ctx.installments.rescheduleInstallments(input.debtId, input.fechaInicio)
    ),

  syncFromMovement: publicProcedure
    .input(z.object({ movementId: z.number() }))
    .mutation(({ ctx, input }) => ctx.installments.syncInstallmentFromMovement(input.movementId)),
});
