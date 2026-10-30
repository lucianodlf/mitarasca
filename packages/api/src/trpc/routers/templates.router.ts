import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";

export const templatesRouter = router({
  generateMonthFromPrevious: publicProcedure
    .input(z.object({ year: z.number(), month: z.number() }))
    .mutation(({ ctx, input }) => ctx.templates.generateMonthFromPrevious(input.year, input.month)),
});
