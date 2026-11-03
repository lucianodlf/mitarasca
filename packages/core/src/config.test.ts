import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  expandHome,
  loadConfig,
  resolveConfigPath,
  resolveInstallConfigPath,
  serializeConfig,
} from "./config.js";

let tmpHome: string;
let tmpProject: string;
let originalHome: string | undefined;
let originalXdg: string | undefined;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "mitarasca-home-"));
  tmpProject = mkdtempSync(join(tmpdir(), "mitarasca-project-"));
  originalHome = process.env.HOME;
  originalXdg = process.env.XDG_CONFIG_HOME;
  process.env.HOME = tmpHome;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  delete process.env.XDG_CONFIG_HOME;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpProject, { recursive: true, force: true });
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  if (originalXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = originalXdg;
});

describe("expandHome", () => {
  test("expande ~ al home del usuario", () => {
    expect(expandHome("~/foo/bar")).toBe(join(tmpHome, "foo/bar"));
  });

  test("deja rutas absolutas intactas", () => {
    expect(expandHome("/abs/path")).toBe("/abs/path");
  });
});

describe("resolveConfigPath", () => {
  test("globalPath usa ~/.config/mitarasca/config.toml sin XDG_CONFIG_HOME", () => {
    const { globalPath } = resolveConfigPath(tmpProject);
    expect(globalPath).toBe(join(tmpHome, ".config/mitarasca/config.toml"));
  });

  test("globalPath respeta XDG_CONFIG_HOME", () => {
    process.env.XDG_CONFIG_HOME = join(tmpHome, "xdg");
    const { globalPath } = resolveConfigPath(tmpProject);
    expect(globalPath).toBe(join(tmpHome, "xdg/mitarasca/config.toml"));
  });

  test("projectPath apunta a <cwd>/.mitarasca/config.toml", () => {
    const { projectPath } = resolveConfigPath(tmpProject);
    expect(projectPath).toBe(join(tmpProject, ".mitarasca/config.toml"));
  });
});

describe("resolveInstallConfigPath", () => {
  test("apunta a <cwd>/.mitarasca/config.toml sin subir directorios", () => {
    const nested = join(tmpProject, "nested", "deeper");
    mkdirSync(nested, { recursive: true });
    const ancestorConfigDir = join(tmpProject, ".mitarasca");
    mkdirSync(ancestorConfigDir, { recursive: true });
    writeFileSync(join(ancestorConfigDir, "config.toml"), 'db_path = "~/ancestro.db"\n');

    const { projectPath } = resolveInstallConfigPath(nested);
    expect(projectPath).toBe(join(nested, ".mitarasca/config.toml"));

    const { projectPath: walkedUpPath } = resolveConfigPath(nested);
    expect(walkedUpPath).toBe(join(tmpProject, ".mitarasca/config.toml"));
    expect(walkedUpPath).not.toBe(projectPath);
  });
});

describe("loadConfig", () => {
  test("devuelve {} si no hay ningún config", () => {
    expect(loadConfig(tmpProject)).toEqual({});
  });

  test("lee el config global si existe", () => {
    const globalDir = join(tmpHome, ".config/mitarasca");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(join(globalDir, "config.toml"), 'db_path = "~/data/g.db"\n');
    expect(loadConfig(tmpProject)).toEqual({ db_path: join(tmpHome, "data/g.db") });
  });

  test("el config de proyecto pisa al global campo por campo", () => {
    const globalDir = join(tmpHome, ".config/mitarasca");
    mkdirSync(globalDir, { recursive: true });
    writeFileSync(
      join(globalDir, "config.toml"),
      'db_path = "~/data/g.db"\n\n[ai]\nprovider = "anthropic"\n'
    );
    const projectDir = join(tmpProject, ".mitarasca");
    mkdirSync(projectDir, { recursive: true });
    writeFileSync(join(projectDir, "config.toml"), 'db_path = "./data/p.db"\n');

    expect(loadConfig(tmpProject)).toEqual({
      db_path: join(tmpProject, "data/p.db"),
      ai: { provider: "anthropic" },
    });
  });
});

describe("serializeConfig", () => {
  test("produce TOML parseable de vuelta a un objeto equivalente", () => {
    const config = {
      db_path: "~/data/mitarasca.db",
      paths: { inbox: "~/data/inbox", imports: "~/data/imports" },
      ai: { provider: "google" as const, model: "gemini-2.5-pro" },
    };
    const toml = serializeConfig(config);
    const parsed = Bun.TOML.parse(toml) as typeof config;
    expect(parsed).toEqual(config);
  });
});
