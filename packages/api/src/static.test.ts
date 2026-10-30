import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let distDir: string;

beforeAll(() => {
  distDir = mkdtempSync(join(tmpdir(), "mitarasca-dist-"));
  writeFileSync(join(distDir, "index.html"), "<html><body>shell</body></html>");
  mkdirSync(join(distDir, "assets"));
  writeFileSync(join(distDir, "assets", "app.js"), "console.log('app')");
  process.env.MITARASCA_WEB_DIST = distDir;
});

afterAll(() => {
  rmSync(distDir, { recursive: true, force: true });
  delete process.env.MITARASCA_WEB_DIST;
});

describe("estáticos + fallback SPA", () => {
  test("GET /health no se ve interceptado por el fallback", async () => {
    const { default: server } = await import(`./index.js?t=${Date.now()}`);
    const res = await server.fetch(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: "ok" });
  });

  test("GET /assets/app.js sirve el archivo estático real", async () => {
    const { default: server } = await import(`./index.js?t=${Date.now()}`);
    const res = await server.fetch(new Request("http://localhost/assets/app.js"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("console.log('app')");
  });

  test("GET /alguna-ruta-de-vue-router cae a index.html", async () => {
    const { default: server } = await import(`./index.js?t=${Date.now()}`);
    const res = await server.fetch(new Request("http://localhost/movimientos"));
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("shell");
  });

  test("GET /trpc/health.check no se ve interceptado por el fallback (llega al handler tRPC)", async () => {
    const { default: server } = await import(`./index.js?t=${Date.now()}`);
    const res = await server.fetch(new Request("http://localhost/trpc/health.check"));
    // No existe ese procedure, pero debe ser una respuesta de tRPC (404/400 JSON), no el HTML del shell.
    const body = await res.text();
    expect(body).not.toContain("shell");
  });
});
