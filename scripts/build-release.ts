import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = join(ROOT, "dist-release");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log("1/5 — build de web…");
await Bun.$`bun run --cwd ${join(ROOT, "packages/web")} build`;

console.log("2/5 — bundle de cli (entrypoint único, define MITARASCA_INSTALLED)…");
const bundleResult = await Bun.build({
  entrypoints: [join(ROOT, "packages/cli/src/index.ts")],
  outdir: OUT,
  target: "bun",
  define: {
    "process.env.MITARASCA_INSTALLED": '"1"',
  },
});
if (!bundleResult.success) {
  console.error(bundleResult.logs);
  throw new Error("Bundle falló");
}

console.log("3/5 — copiar migraciones…");
cpSync(join(ROOT, "packages/core/drizzle"), join(OUT, "drizzle"), { recursive: true });

console.log("4/5 — copiar dist de web y assets de skill…");
cpSync(join(ROOT, "packages/web/dist"), join(OUT, "web-dist"), { recursive: true });
cpSync(join(ROOT, "packages/cli/assets"), join(OUT, "assets"), { recursive: true });

console.log("5/5 — escribir package.json de release…");
const rootPkg = JSON.parse(await Bun.file(join(ROOT, "packages/cli/package.json")).text());
writeFileSync(
  join(OUT, "package.json"),
  JSON.stringify(
    {
      name: "@lucianodlf/mitarasca",
      version: rootPkg.version,
      private: false,
      type: "module",
      bin: { mitarasca: "./index.js" },
      files: ["index.js", "drizzle", "web-dist", "assets"],
    },
    null,
    2
  )
);

console.log(`Listo: ${OUT}`);
