import { trpcServer } from "@hono/trpc-server";
import { assertDbExists } from "@mitarasca/core";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { createContext } from "./trpc/context.js";
import { appRouter } from "./trpc/router.js";

// La API no crea la DB: avisa y sigue; cada request devuelve el error de getDb().
try {
  assertDbExists();
} catch (err) {
  console.warn(`[mitarasca] ${(err as Error).message}`);
}

const app = new Hono();

// CORS de respaldo (en dev la web usa el proxy de Vite y no lo necesita).
app.use(
  "/trpc/*",
  cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173", credentials: true })
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext,
  })
);

const webDist =
  process.env.MITARASCA_WEB_DIST ??
  (process.env.MITARASCA_INSTALLED === "1"
    ? new URL("web-dist", import.meta.url).pathname
    : new URL("../../web/dist", import.meta.url).pathname);

app.use("/*", async (c) => {
  const pathname = new URL(c.req.url).pathname;

  const filePath = `${webDist}${pathname}`;
  const file = Bun.file(filePath);

  if (await file.exists()) {
    return new Response(file);
  }

  const indexHtml = Bun.file(`${webDist}/index.html`);
  return new Response(indexHtml, { headers: { "content-type": "text/html" } });
});

export default {
  port: Number(process.env.API_PORT ?? 3787),
  fetch: app.fetch,
};

export type { AppRouter } from "./trpc/router.js";
