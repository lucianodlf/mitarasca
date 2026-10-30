import { balanceRouter } from "./routers/balance.router.js";
import { debtsRouter } from "./routers/debts.router.js";
import { dedupRouter } from "./routers/dedup.router.js";
import { movementsRouter } from "./routers/movements.router.js";
import { tagsRouter } from "./routers/tags.router.js";
import { templatesRouter } from "./routers/templates.router.js";
import { router } from "./trpc.js";

export const appRouter = router({
  movements: movementsRouter,
  tags: tagsRouter,
  balance: balanceRouter,
  debts: debtsRouter,
  templates: templatesRouter,
  dedup: dedupRouter,
});

export type AppRouter = typeof appRouter;
