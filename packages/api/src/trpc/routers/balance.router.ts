import { z } from "zod";
import { stripUndefined } from "../strip-undefined.js";
import { publicProcedure, router } from "../trpc.js";

const mode = z.enum(["proyectado", "real"]);

export const balanceRouter = router({
  summarizeByYear: publicProcedure
    .input(z.object({ year: z.number(), mode }))
    .query(({ ctx, input }) => ctx.balance.summarizeByYear(input.year, input.mode)),

  getYearWithEstimate: publicProcedure
    .input(
      z.object({
        year: z.number(),
        mode,
        includeVariableEstimate: z.boolean().optional(),
        n: z.number().optional(),
      })
    )
    .query(({ ctx, input }) =>
      ctx.balance.getYearBalanceWithEstimate(
        input.year,
        input.mode,
        stripUndefined({
          includeVariableEstimate: input.includeVariableEstimate ?? false,
          estimateOptions: input.n !== undefined ? { n: input.n } : undefined,
        })
      )
    ),
});
