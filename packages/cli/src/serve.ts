// packages/cli/src/serve.ts
import { assertDbExists } from "@mitarasca/core";

export type StartServerOptions = {
  port: number;
  openBrowser: boolean;
};

export async function startServer(opts: StartServerOptions): Promise<void> {
  assertDbExists();

  const { default: apiServer } = await import("@mitarasca/api");

  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({ ...apiServer, port: opts.port });
  } catch (err) {
    if (err instanceof Error && "code" in err && err.code === "EADDRINUSE") {
      throw new Error(
        `El puerto ${opts.port} ya está en uso. Cerrá el proceso que lo ocupa o pasá otro puerto con --port.`
      );
    }
    throw err;
  }

  const url = `http://localhost:${server.port}`;
  console.log(`mitarasca corriendo en ${url}`);

  if (opts.openBrowser) {
    const openCmd =
      process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
    try {
      Bun.spawn([openCmd, url], { stdout: "ignore", stderr: "ignore" });
    } catch {
      console.log(`No pude abrir el navegador (${openCmd}); abrí ${url} a mano.`);
    }
  }
}
