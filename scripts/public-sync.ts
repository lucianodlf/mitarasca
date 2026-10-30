// Export del repo privado al clon local del repo público ([056]).
// Uso: bun scripts/public-sync.ts --manifest <archivo> --dest <dir> --version X.Y.Z [--source <dir>]
//      [--replacements <archivo>]
//
// 0. Falla si el destino tiene cambios sin commitear o si hay cambios sin commitear en las rutas
//    del manifest del origen.
// 1. Copia al destino los archivos trackeados por git en las rutas del manifest y borra del
//    destino los que ya no existen dentro de esas rutas.
// 2. Aplica las transformaciones (TRANSFORMS) y los reemplazos de texto de --replacements.
// 3. Falla si en el destino queda alguna ruta fuera del manifest o algún archivo copiado que el
//    .gitignore del destino ignoraría.
// 4. Corre gitleaks sobre el destino y falla si encuentra algo.
// 5. Hace commit `release vX.Y.Z` en el destino solo si hay cambios. No pushea.
import {
  chmodSync,
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parseArgs } from "node:util";

export type TransformContext = { dest: string; version: string };
export type Transform = (ctx: TransformContext) => void | Promise<void>;

// Punto de extensión: README público, quitar referencias a WP y al deploy privado, etc.
// Se definen en el repo privado junto con el public-manifest ([055]).
const TRANSFORMS: Transform[] = [];

export type Replacement = [search: string, replace: string];

// Una regla por línea: `buscar => reemplazo`, texto literal. `#` inicia comentario. Se aplican en
// orden, así que una regla más específica va antes que la más general que la contiene.
export function parseReplacements(text: string): Replacement[] {
  const rules: Replacement[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const parts = line.split(" => ");
    const search = parts[0]?.trim() ?? "";
    if (parts.length !== 2 || search === "") {
      throw new Error(`Regla inválida en el archivo de reemplazos: "${raw.trim()}"`);
    }
    rules.push([search, parts[1]?.trim() ?? ""]);
  }
  return rules;
}

export function applyReplacements(text: string, rules: Replacement[]): string {
  return rules.reduce((acc, [search, replace]) => acc.replaceAll(search, replace), text);
}

// Los valores a ocultar viven en un archivo fuera del manifest: este script se publica.
function replaceInFiles(rules: Replacement[]): Transform {
  return async ({ dest }) => {
    for (const path of await gitFiles(dest, destListArgs)) {
      const file = join(dest, path);
      if (lstatSync(file).isSymbolicLink()) continue;
      const text = readFileSync(file, "utf8");
      if (text.includes("\0")) continue; // binario
      const replaced = applyReplacements(text, rules);
      if (replaced !== text) writeFileSync(file, replaced);
    }
  };
}

// Una ruta por línea, relativa a la raíz del repo: archivo o carpeta. `#` inicia comentario.
export function parseManifest(text: string): string[] {
  const entries: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const entry = line.replace(/^\.\//, "").replace(/\/+$/, "");
    if (entry === "" || entry === "." || isAbsolute(entry) || entry.split("/").includes("..")) {
      throw new Error(`Ruta inválida en el manifest: "${raw.trim()}"`);
    }
    if (entry === ".git" || entry.startsWith(".git/")) {
      throw new Error(`El manifest no puede incluir .git: "${raw.trim()}"`);
    }
    if (!entries.includes(entry)) entries.push(entry);
  }
  if (entries.length === 0) throw new Error("El manifest está vacío");
  return entries;
}

export function isInManifest(path: string, entries: string[]): boolean {
  return entries.some((e) => path === e || path.startsWith(`${e}/`));
}

export function outsideManifest(paths: string[], entries: string[]): string[] {
  return paths.filter((p) => !isInManifest(p, entries));
}

// Un symlink absoluto o que sale del repo filtraría una ruta local, y gitleaks no lo detecta.
export function symlinkEscapes(root: string, linkPath: string, target: string): boolean {
  if (isAbsolute(target)) return true;
  const resolved = resolve(dirname(linkPath), target);
  return resolved !== root && !resolved.startsWith(`${root}/`);
}

export function parseVersion(value: string): string {
  const version = value.replace(/^v/, "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`Versión inválida: "${value}" (se espera X.Y.Z)`);
  }
  return version;
}

function fail(message: string): never {
  console.error(`public-sync: ${message}`);
  process.exit(1);
}

const destListArgs = ["ls-files", "-z", "--cached", "--others", "--exclude-standard"];

async function gitFiles(cwd: string, args: string[]): Promise<string[]> {
  const out = await Bun.$`git --literal-pathspecs -C ${cwd} ${args}`.quiet().text();
  return out.split("\0").filter(Boolean);
}

function copyEntry(source: string, dest: string, path: string): void {
  const from = join(source, path);
  const to = join(dest, path);
  const stat = lstatSync(from);
  mkdirSync(dirname(to), { recursive: true });
  rmSync(to, { force: true });
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(from), to);
  } else {
    copyFileSync(from, to);
    chmodSync(to, stat.mode & 0o777);
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      manifest: { type: "string" },
      dest: { type: "string" },
      version: { type: "string" },
      source: { type: "string" },
      replacements: { type: "string" },
    },
  });
  if (!values.manifest || !values.dest || !values.version) {
    fail(
      "uso: --manifest <archivo> --dest <dir> --version X.Y.Z [--source <dir>] [--replacements <archivo>]"
    );
  }

  let entries: string[];
  let version: string;
  let replacements: Replacement[] | undefined;
  try {
    entries = parseManifest(readFileSync(values.manifest, "utf8"));
    version = parseVersion(values.version);
    if (values.replacements) {
      replacements = parseReplacements(readFileSync(values.replacements, "utf8"));
    }
  } catch (e) {
    fail((e as Error).message);
  }

  if (!Bun.which("gitleaks")) {
    fail(
      "gitleaks no está instalado o no está en el PATH; es obligatorio para exportar. " +
        "Instalarlo: https://github.com/gitleaks/gitleaks#installing"
    );
  }

  const source = resolve(values.source ?? resolve(import.meta.dir, ".."));
  const dest = resolve(values.dest);
  const destTop = await Bun.$`git -C ${dest} rev-parse --show-toplevel`.quiet().nothrow();
  if (destTop.exitCode !== 0 || resolve(destTop.text().trim()) !== dest) {
    fail(`el destino no es la raíz de un repo git: ${dest}`);
  }
  // copyEntry borra el archivo de destino antes de copiar: con dest == source borraría el original.
  if (realpathSync(dest) === realpathSync(source)) {
    fail("el destino no puede ser el repo de origen");
  }

  // Si una corrida anterior falló después de copiar, el destino quedó con archivos sin commitear.
  const destDirty = await gitFiles(dest, ["status", "--porcelain", "-z"]);
  if (destDirty.length > 0) {
    const clean = `git -C ${dest} reset --hard && git -C ${dest} clean -fdx`;
    const files = destDirty.map((l) => l.slice(3)).join("\n  ");
    fail(
      `el destino tiene cambios sin commitear (¿falló una corrida anterior?). Limpiar con: ${clean}\n  ${files}`
    );
  }

  // La release es lo commiteado: un cambio sin commitear en las rutas del manifest no viaja.
  const dirty = await gitFiles(source, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=no",
    "--",
    ...entries,
  ]);
  if (dirty.length > 0) {
    fail(
      `hay cambios sin commitear en rutas del manifest:\n  ${dirty.map((l) => l.slice(3)).join("\n  ")}`
    );
  }

  const sourceFiles: string[] = [];
  for (const entry of entries) {
    const files = await gitFiles(source, ["ls-files", "-z", "--", entry]);
    if (files.length === 0) fail(`la ruta del manifest no tiene archivos trackeados: ${entry}`);
    sourceFiles.push(...files);
  }
  const sourceSet = new Set(sourceFiles);
  // Antes de tocar el destino: un submódulo es una carpeta trackeada como gitlink (copyFileSync
  // fallaría a mitad del export) y un symlink que sale del repo filtraría una ruta local.
  for (const path of sourceSet) {
    const from = join(source, path);
    const stat = lstatSync(from);
    if (stat.isDirectory()) fail(`submódulos no soportados: ${path}`);
    if (stat.isSymbolicLink() && symlinkEscapes(source, from, readlinkSync(from))) {
      fail(`symlink con destino absoluto o fuera del repo: ${path} -> ${readlinkSync(from)}`);
    }
  }

  for (const path of await gitFiles(dest, destListArgs)) {
    if (isInManifest(path, entries) && !sourceSet.has(path))
      rmSync(join(dest, path), { force: true });
  }
  for (const path of sourceSet) copyEntry(source, dest, path);

  const transforms = replacements ? [...TRANSFORMS, replaceInFiles(replacements)] : TRANSFORMS;
  for (const transform of transforms) await transform({ dest, version });

  const outside = outsideManifest(await gitFiles(dest, destListArgs), entries);
  if (outside.length > 0) {
    fail(`rutas fuera del manifest en el destino (no se hizo commit):\n  ${outside.join("\n  ")}`);
  }

  // Sin --literal-pathspecs (check-ignore no lo admite) y sin --no-index: solo reporta lo que git add -A omitiría (ignorado y todavía no trackeado).
  const sourceList = Buffer.from(`${[...sourceSet].join("\0")}\0`);
  const ignoredRun = await Bun.$`git -C ${dest} check-ignore -z --stdin < ${sourceList}`
    .quiet()
    .nothrow();
  if (ignoredRun.exitCode > 1) fail("git check-ignore falló en el destino");
  const ignored = ignoredRun.stdout.toString().split("\0").filter(Boolean);
  if (ignored.length > 0) {
    fail(
      `archivos del origen que el .gitignore del destino ignoraría (no se hizo commit):\n  ${ignored.join("\n  ")}`
    );
  }

  // `dir` existe desde gitleaks 8.19; en versiones anteriores el equivalente es detect --no-git.
  const hasDir = (await Bun.$`gitleaks dir --help`.quiet().nothrow()).exitCode === 0;
  const scan = hasDir
    ? ["dir", "--no-banner", "--redact", dest]
    : ["detect", "--no-git", "--no-banner", "--redact", "--source", dest];
  const leaks = await Bun.$`gitleaks ${scan}`.nothrow();
  if (leaks.exitCode !== 0) fail("gitleaks encontró posibles secretos o falló (no se hizo commit)");

  await Bun.$`git -C ${dest} add -A`.quiet();
  const staged = await Bun.$`git -C ${dest} diff --cached --quiet`.quiet().nothrow();
  if (staged.exitCode === 0) {
    console.log("public-sync: sin cambios, no se hace commit");
    return;
  }
  await Bun.$`git -C ${dest} commit -q -m ${`release v${version}`}`;
  console.log(`public-sync: commit "release v${version}" en ${dest} (sin push)`);
}

if (import.meta.main) await main();
