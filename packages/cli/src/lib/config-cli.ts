import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { MitarascaConfig } from "@mitarasca/core";
import { resolveConfigPath, serializeConfig } from "@mitarasca/core";

const VALID_PATHS_KEYS = ["inbox", "imports", "processed", "backups"] as const;
const VALID_AI_KEYS = ["provider", "model"] as const;

export function getConfigValue(config: MitarascaConfig, key: string): string | undefined {
  const [top, sub] = key.split(".");
  if (top === "db_path") return config.db_path;
  if (top === "paths" && sub) return config.paths?.[sub as (typeof VALID_PATHS_KEYS)[number]];
  if (top === "ai" && sub) return config.ai?.[sub as (typeof VALID_AI_KEYS)[number]];
  throw new Error(`Clave de config inválida: "${key}"`);
}

export function setConfigValue(
  config: MitarascaConfig,
  key: string,
  value: string
): MitarascaConfig {
  const [top, sub] = key.split(".");
  if (top === "db_path") return { ...config, db_path: value };
  if (top === "paths" && sub && (VALID_PATHS_KEYS as readonly string[]).includes(sub)) {
    return { ...config, paths: { ...config.paths, [sub]: value } };
  }
  if (top === "ai" && sub && (VALID_AI_KEYS as readonly string[]).includes(sub)) {
    return { ...config, ai: { ...config.ai, [sub]: value } };
  }
  throw new Error(`Clave de config inválida: "${key}"`);
}

export function writeConfigFile(scope: "project" | "global", config: MitarascaConfig): string {
  const { projectPath, globalPath } = resolveConfigPath();
  const path = scope === "project" ? projectPath : globalPath;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeConfig(config));
  return path;
}

export function readScopedConfig(scope: "project" | "global"): MitarascaConfig {
  const { projectPath, globalPath } = resolveConfigPath();
  const path = scope === "project" ? projectPath : globalPath;
  if (!existsSync(path)) return {};
  return Bun.TOML.parse(readFileSync(path, "utf-8")) as MitarascaConfig;
}
