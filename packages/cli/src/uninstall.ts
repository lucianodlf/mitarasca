import { existsSync, lstatSync, realpathSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig, resolveConfigPath, resolveDbPath, resolveDemoDbPath } from "@mitarasca/core";

export type UninstallResult = { linkRemoved: boolean; linkMsg: string; leftovers: string[] };

/**
 * Borra `binPath` solo si es un symlink que apunta a `cliEntry` (este clon) y lista los datos
 * y configs que quedan. Nunca borra datos.
 */
export function runUninstall(opts: { binPath: string; cliEntry: string }): UninstallResult {
  const { binPath, cliEntry } = opts;
  let linkRemoved = false;
  let linkMsg: string;
  const stat = lstatSync(binPath, { throwIfNoEntry: false });
  if (!stat) {
    linkMsg = `No hay nada que quitar en ${binPath}.`;
  } else if (!stat.isSymbolicLink() || !existsSync(binPath)) {
    linkMsg = `${binPath} no es un symlink válido de mitarasca: no lo toqué.`;
  } else if (realpathSync(binPath) !== realpathSync(cliEntry)) {
    linkMsg = `${binPath} apunta a otra instalación (${realpathSync(binPath)}): no lo toqué.`;
  } else {
    unlinkSync(binPath);
    linkRemoved = true;
    linkMsg = `Quité ${binPath}.`;
  }

  const home = process.env.HOME || homedir();
  const xdgData = join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "mitarasca");
  // packages/cli/src/uninstall.ts -> raíz del clon
  const cloneDir = realpathSync(new URL("../../..", import.meta.url).pathname);
  const { projectPath, globalPath } = resolveConfigPath();
  const candidates = [
    resolveDbPath(),
    resolveDemoDbPath(),
    ...Object.values(loadConfig().paths ?? {}),
    dirname(globalPath),
    projectPath,
    xdgData,
    ...(cloneDir === xdgData ? [cloneDir] : []),
  ];
  const existing = [...new Set(candidates)].filter((p) => existsSync(p));
  // Si una ruta ya está dentro de otra listada, sobra.
  const leftovers = existing.filter((p) => !existing.some((q) => q !== p && p.startsWith(`${q}/`)));
  return { linkRemoved, linkMsg, leftovers };
}
