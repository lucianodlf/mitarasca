import { z } from "zod";
import { stripUndefined } from "../strip-undefined.js";
import { publicProcedure, router } from "../trpc.js";

const direccion = z.enum(["in", "out"]);
const reglaOp = z.enum(["div", "mul", "none"]);
const mode = z.enum(["proyectado", "real"]);

const createInput = z.object({
  data: z.object({
    fecha: z.string(),
    direccion,
    monto_total: z.number(),
    regla_op: reglaOp.optional(),
    regla_factor: z.number().nullable().optional(),
    detalle: z.string(),
    observacion: z.string().nullable().optional(),
    installment_id: z.number().nullable().optional(),
    source_movement_id: z.number().nullable().optional(),
    pago_total_propio: z.boolean().nullable().optional(),
  }),
  tagIds: z.array(z.number()),
});

const updateInput = z.object({
  id: z.number(),
  data: createInput.shape.data.partial(),
  tagIds: z.array(z.number()).optional(),
});

export const movementsRouter = router({
  listByDateRange: publicProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(({ ctx, input }) => ctx.movements.listMovementsByDateRange(input.from, input.to)),

  listByDirection: publicProcedure
    .input(z.object({ direccion }))
    .query(({ ctx, input }) => ctx.movements.listMovementsByDirection(input.direccion)),

  listByTag: publicProcedure
    .input(z.object({ tagId: z.number() }))
    .query(({ ctx, input }) => ctx.movements.listMovementsByTag(input.tagId)),

  getById: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ ctx, input }) => ctx.movements.getMovementById(input.id)),

  summarizeByMonth: publicProcedure
    .input(z.object({ year: z.number(), month: z.number(), mode }))
    .query(({ ctx, input }) => ctx.movements.summarizeByMonth(input.year, input.month, input.mode)),

  create: publicProcedure
    .input(createInput)
    .mutation(({ ctx, input }) =>
      ctx.movements.createMovement(stripUndefined(input.data), input.tagIds)
    ),

  update: publicProcedure
    .input(updateInput)
    .mutation(({ ctx, input }) =>
      ctx.movements.updateMovement(input.id, stripUndefined(input.data), input.tagIds)
    ),

  delete: publicProcedure.input(z.object({ id: z.number() })).mutation(({ ctx, input }) => {
    ctx.movements.deleteMovement(input.id);
    return { id: input.id };
  }),

  toggleEstado: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => ctx.movements.toggleMovementEstado(input.id)),

  listShares: publicProcedure
    .input(z.object({ movementId: z.number() }))
    .query(({ ctx, input }) => ctx.movements.listMovementShares(input.movementId)),

  updateShare: publicProcedure
    .input(
      z.object({
        id: z.number(),
        data: z.object({
          persona_tag_id: z.number().nullable().optional(),
          pagado: z.boolean().optional(),
        }),
      })
    )
    .mutation(({ ctx, input }) =>
      ctx.movements.updateMovementShare(input.id, stripUndefined(input.data))
    ),
});
