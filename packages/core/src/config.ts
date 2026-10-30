import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export type AiProvider = "anthropic" | "google" | "openai";

export type MitarascaConfig = {
  db_path?: string;
  paths?: {
    inbox?: string;
    imports?: string;
    processed?: string;
    backups?: string;
  };
  ai?: {
    provider?: AiProvider;
    model?: string;
  };
};

export function expandHome(path: string): string {
  const home = process.env.HOME || homedir();
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path;
}

function findProjectConfigDir(startCwd: string): string | undefined {
  let dir = resolve(startCwd);
  while (true) {
    const candidate = join(dir, ".mitarasca", "config.toml");
    if (existsSync(candidate)) return join(dir, ".mitarasca");
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function resolveConfigPath(cwd: string = process.cwd()): {
  projectDir: string;
  projectPath: string;
  globalPath: string;
} {
  const projectDir = findProjectConfigDir(cwd) ?? join(cwd, ".mitarasca");
  const home = process.env.HOME || homedir();
  const xdgConfigHome = process.env.XDG_CONFIG_HOME
    ? expandHome(process.env.XDG_CONFIG_HOME)
    : join(home, ".config");
  return {
    projectDir,
    projectPath: join(projectDir, "config.toml"),
    globalPath: join(xdgConfigHome, "mitarasca", "config.toml"),
  };
}

/**
 * Resuelve dónde escribir un config nuevo de scope "project", sin el walk-up de
 * `findProjectConfigDir` (que busca un `.mitarasca/config.toml` ya existente subiendo
 * directorios — correcto para lectura normal vía `loadConfig`, pero peligroso para decidir
 * dónde *escribir* uno nuevo, porque puede pisar el config de un checkout ancestro).
 */
export function resolveInstallConfigPath(cwd: string): { projectDir: string; projectPath: string } {
  const projectDir = join(resolve(cwd), ".mitarasca");
  return { projectDir, projectPath: join(projectDir, "config.toml") };
}

/** Resuelve un path del config: expande `~`, y si queda relativo lo ancla al directorio del proyecto (padre de `.mitarasca/`), no al cwd del proceso. */
export function resolveConfigRelativePath(path: string, projectDir: string): string {
  const expanded = expandHome(path);
  if (resolve(expanded) === expanded) return expanded;
  return resolve(dirname(projectDir), expanded);
}

function readTomlIfExists(path: string): MitarascaConfig {
  if (!existsSync(path)) return {};
  return Bun.TOML.parse(readFileSync(path, "utf-8")) as MitarascaConfig;
}

function mergeConfig(base: MitarascaConfig, override: MitarascaConfig): MitarascaConfig {
  const result: MitarascaConfig = {
    ...base,
    ...override,
  };

  const mergedPaths = { ...base.paths, ...override.paths };
  if (Object.keys(mergedPaths).length > 0) {
    result.paths = mergedPaths;
  }

  const mergedAi = { ...base.ai, ...override.ai };
  if (Object.keys(mergedAi).length > 0) {
    result.ai = mergedAi;
  }

  return result;
}

export function loadConfig(cwd: string = process.cwd()): MitarascaConfig {
  const { projectDir, projectPath, globalPath } = resolveConfigPath(cwd);
  const global = readTomlIfExists(globalPath);
  const project = readTomlIfExists(projectPath);
  const merged = mergeConfig(global, project);
  if (merged.db_path !== undefined) {
    merged.db_path = resolveConfigRelativePath(merged.db_path, projectDir);
  }
  if (merged.paths) {
    for (const key of Object.keys(merged.paths) as (keyof typeof merged.paths)[]) {
      const value = merged.paths[key];
      if (value !== undefined) merged.paths[key] = resolveConfigRelativePath(value, projectDir);
    }
  }
  return merged;
}

export function serializeConfig(config: MitarascaConfig): string {
  const lines: string[] = [];
  if (config.db_path !== undefined) lines.push(`db_path = ${JSON.stringify(config.db_path)}`);
  if (config.paths && Object.keys(config.paths).length > 0) {
    lines.push("", "[paths]");
    for (const [k, v] of Object.entries(config.paths)) {
      if (v !== undefined) lines.push(`${k} = ${JSON.stringify(v)}`);
    }
  }
  if (config.ai && Object.keys(config.ai).length > 0) {
    lines.push("", "[ai]");
    for (const [k, v] of Object.entries(config.ai)) {
      if (v !== undefined) lines.push(`${k} = ${JSON.stringify(v)}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
