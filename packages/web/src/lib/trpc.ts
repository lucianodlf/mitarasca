import type { AppRouter } from "@mitarasca/api/router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

// `import type` garantiza que el grafo runtime del core (bun:sqlite) nunca
// entra al bundle del navegador. La URL es relativa: el proxy de Vite la
// reenvía a la API (:3787) en dev.
export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "/trpc",
    }),
  ],
});
