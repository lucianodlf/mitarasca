import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AiProvider, MitarascaConfig } from "@mitarasca/core";
import {
  expandHome,
  resolveConfigPath,
  resolveInstallConfigPath,
  serializeConfig,
} from "@mitarasca/core";
import { promptCheckbox, promptRadio } from "./lib/tui.js";
import type { Choice } from "./lib/tui.js";

export type InstallFlags = {
  yes?: boolean;
  scope?: "project" | "global";
  harnesses?: string;
  provider?: string;
  model?: string;
  dbPath?: string;
  force?: boolean;
  link?: boolean;
};

export type RunInstallOptions = {
  cwd: string;
  home: string;
  skillSourceDir: string;
  cliPackageDir?: string;
};

const HARNESS_NAMES = ["claude", "codex"] as const;
type HarnessName = (typeof HARNESS_NAMES)[number];

export function detectHarnesses(
  cwd: string,
  home: string
): { name: HarnessName; detected: boolean }[] {
  const check = (paths: string[]) => paths.some((p) => existsSync(p));
  return [
    {
      name: "claude",
      detected: check([join(cwd, ".claude"), join(home, ".claude")]),
    },
    {
      name: "codex",
      detected: check([
        join(cwd, ".codex"),
        join(cwd, ".agents"),
        join(home, ".codex"),
        join(home, ".agents"),
      ]),
    },
  ];
}

export function skillDestinations(
  scope: "project" | "global",
  cwd: string,
  home: string
): { harness: HarnessName; path: string }[] {
  const root = scope === "project" ? cwd : home;
  return [
    { harness: "claude", path: join(root, ".claude", "skills", "importar-movimientos") },
    { harness: "codex", path: join(root, ".agents", "skills", "importar-movimientos") },
  ];
}

const PROVIDER_ENV_VAR: Record<AiProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  openai: "OPENAI_API_KEY",
};

const DEFAULT_MODEL: Record<AiProvider, string> = {
  anthropic: "claude-sonnet-5",
  google: "gemini-2.5-pro",
  openai: "gpt-5",
};

async function resolveExistingConfigGuard(
  configPath: string,
  flags: InstallFlags
): Promise<"overwrite" | "keep" | "cancel"> {
  if (!existsSync(configPath)) return "overwrite";
  if (flags.yes) {
    if (!flags.force) {
      throw new Error(
        `Ya existe un config en ${configPath}. Instalación no interactiva (--yes) requiere --force ` +
          `para autorizar backup + sobreescritura.`
      );
    }
    return "overwrite";
  }
  const choices: Choice[] = [
    { label: `Hacer backup y sobreescribir (${configPath})`, value: "overwrite" },
    { label: "Dejar el existente sin tocar (continuar con el resto)", value: "keep" },
    { label: "Cancelar instalación", value: "cancel" },
  ];
  return (await promptRadio(`Ya existe un config en ${configPath}`, choices)) as
    | "overwrite"
    | "keep"
    | "cancel";
}

function backupExistingConfig(configPath: string): string {
  const backupPath = `${configPath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  cpSync(configPath, backupPath);
  return backupPath;
}

export async function runInstall(
  flags: InstallFlags,
  opts: RunInstallOptions
): Promise<{ configPath: string; skillPaths: string[] }> {
  // ponytail: resolveConfigPath/expandHome (core) leen process.env.HOME internamente
  // (no aceptan un parámetro home). Para que runInstall sea testeable con un home
  // temporal sin tocar el HOME real del proceso, lo pisamos acá y lo restauramos
  // al final. Si core alguna vez acepta `home` como parámetro, esto se puede borrar.
  const originalHome = process.env.HOME;
  const originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = opts.home;
  delete process.env.XDG_CONFIG_HOME;

  try {
    const scope: "project" | "global" = flags.scope ?? (flags.yes ? "global" : await promptScope());

    const { globalPath } = resolveConfigPath(opts.cwd);
    const { projectPath } = resolveInstallConfigPath(opts.cwd);
    const configPath = scope === "project" ? projectPath : globalPath;

    const detected = detectHarnesses(opts.cwd, opts.home);
    const chosenHarnesses: HarnessName[] = flags.harnesses
      ? (flags.harnesses.split(",").map((h) => h.trim()) as HarnessName[])
      : flags.yes
        ? detected.filter((d) => d.detected).map((d) => d.name)
        : await promptHarnesses(detected);

    const provider = (flags.provider ??
      (flags.yes ? "anthropic" : await promptProvider())) as AiProvider;
    const model = flags.model ?? DEFAULT_MODEL[provider];

    const envVar = PROVIDER_ENV_VAR[provider];
    if (!process.env[envVar]) {
      console.log(
        `\n[aviso] No se encontró ${envVar} en el entorno. La instalación continúa igual; agregá ` +
          `esta línea a tu shell rc cuando quieras activar la extracción con IA:\n` +
          `  export ${envVar}="tu-api-key"\n` +
          `(o cargala directamente en ${configPath} más adelante)\n`
      );
    }

    const guard = await resolveExistingConfigGuard(configPath, flags);
    if (guard === "cancel") throw new Error("Instalación cancelada por el usuario.");
    let skipConfigWrite = false;
    if (guard === "keep") {
      skipConfigWrite = true;
    } else if (existsSync(configPath)) {
      console.log(`Backup del config existente: ${backupExistingConfig(configPath)}`);
    }

    const dataRoot = expandHome(
      flags.dbPath ? join(flags.dbPath, "..") : "~/.local/share/mitarasca"
    );
    const config: MitarascaConfig = {
      db_path: flags.dbPath ?? join(dataRoot, "mitarasca.db"),
      paths: {
        inbox: join(dataRoot, "inbox"),
        imports: join(dataRoot, "imports"),
        processed: join(dataRoot, "processed"),
        backups: join(dataRoot, "backups"),
      },
      ai: { provider, model },
    };

    for (const dir of Object.values(config.paths ?? {})) {
      mkdirSync(dir, { recursive: true });
    }

    mkdirSync(join(configPath, ".."), { recursive: true });
    if (!skipConfigWrite) await Bun.write(configPath, serializeConfig(config));

    const skillPaths: string[] = [];
    for (const dest of skillDestinations(scope, opts.cwd, opts.home)) {
      if (!chosenHarnesses.includes(dest.harness)) continue;
      mkdirSync(dest.path, { recursive: true });
      cpSync(opts.skillSourceDir, dest.path, { recursive: true });
      skillPaths.push(dest.path);
    }

    if (flags.link) {
      if (!opts.cliPackageDir)
        throw new Error("--link requiere cliPackageDir en RunInstallOptions.");
      const link = Bun.spawn(["bun", "link"], {
        cwd: opts.cliPackageDir,
        stdout: "pipe",
        stderr: "pipe",
      });
      await link.exited;
      if (link.exitCode !== 0) throw new Error(`bun link falló (exit ${link.exitCode})`);
      // ponytail: no usamos `bun pm bin -g` porque requiere un package.json en el
      // directorio global de bun (creado normalmente por un `bun add -g` previo);
      // `bun link` solo no lo crea, así que falla en un home recién aislado. El bin
      // dir es igual de determinístico: `${BUN_INSTALL:-$HOME/.bun}/bin`, la misma
      // convención que usa `bun link` para el symlink que acaba de crear.
      const bunInstallRoot = process.env.BUN_INSTALL || join(opts.home, ".bun");
      const binDir = join(bunInstallRoot, "bin");
      console.log(`MITARASCA_BIN_DIR=${binDir}`);
    }

    return { configPath, skillPaths };
  } finally {
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
    else process.env.XDG_CONFIG_HOME = originalXdg;
  }
}

async function promptScope(): Promise<"project" | "global"> {
  const choices: Choice[] = [
    { label: "Global (~/)", value: "global" },
    { label: "Proyecto (cwd)", value: "project" },
  ];
  const value = await promptRadio("Ámbito de instalación", choices);
  return value as "project" | "global";
}

async function promptHarnesses(
  detected: { name: HarnessName; detected: boolean }[]
): Promise<HarnessName[]> {
  const choices: Choice[] = detected.map((d) => ({ label: d.name, value: d.name }));
  const preselected = detected.filter((d) => d.detected).map((d) => d.name);
  const values = await promptCheckbox("¿En qué agentes instalar la skill?", choices, preselected);
  return values as HarnessName[];
}

async function promptProvider(): Promise<AiProvider> {
  const choices: Choice[] = [
    { label: `Anthropic (default: ${DEFAULT_MODEL.anthropic})`, value: "anthropic" },
    { label: `Google (default: ${DEFAULT_MODEL.google})`, value: "google" },
    { label: `OpenAI (default: ${DEFAULT_MODEL.openai})`, value: "openai" },
  ];
  const value = await promptRadio("Proveedor de IA", choices);
  return value as AiProvider;
}
