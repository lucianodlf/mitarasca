import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";

const rango = z.object({ from: z.string(), to: z.string() });
const estado = z.enum(["pendiente", "confirmado", "descartado"]);

export const dedupRouter = router({
  findExactPairs: publicProcedure
    .input(rango)
    .query(({ ctx, input }) => ctx.dedup.findExactPairs(input.from, input.to)),

  findReflejos: publicProcedure
    .input(rango.extend({ ventanaDias: z.number().optional() }))
    .query(({ ctx, input }) =>
      ctx.dedup.findReflejos(input.from, input.to, { ventanaDias: input.ventanaDias ?? 10 })
    ),

  listFindings: publicProcedure
    .input(z.object({ estado: estado.optional() }).optional())
    .query(({ ctx, input }) =>
      input?.estado ? ctx.dedup.listFindings({ estado: input.estado }) : ctx.dedup.listFindings()
    ),

  updateFindingEstado: publicProcedure
    .input(z.object({ id: z.number(), estado }))
    .mutation(({ ctx, input }) => ctx.dedup.updateFindingEstado(input.id, input.estado)),
});
