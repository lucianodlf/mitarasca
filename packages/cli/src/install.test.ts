import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectHarnesses, runInstall, skillDestinations } from "./install.js";

let tmpHome: string;
let tmpCwd: string;
let tmpSkillSource: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "mitarasca-home-"));
  tmpCwd = mkdtempSync(join(tmpdir(), "mitarasca-cwd-"));
  tmpSkillSource = mkdtempSync(join(tmpdir(), "mitarasca-skill-src-"));
  writeFileSync(
    join(tmpSkillSource, "SKILL.md"),
    "---\nname: importar-movimientos\n---\ncontenido"
  );
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpCwd, { recursive: true, force: true });
  rmSync(tmpSkillSource, { recursive: true, force: true });
});

describe("detectHarnesses", () => {
  test("detecta .claude en cwd y ~/.agents en home", () => {
    mkdirSync(join(tmpCwd, ".claude"));
    mkdirSync(join(tmpHome, ".agents"));
    const result = detectHarnesses(tmpCwd, tmpHome);
    const claude = result.find((r) => r.name === "claude");
    const codex = result.find((r) => r.name === "codex");
    expect(claude?.detected).toBe(true);
    expect(codex?.detected).toBe(true);
  });

  test("no detecta nada si no hay directorios", () => {
    const result = detectHarnesses(tmpCwd, tmpHome);
    expect(result.every((r) => !r.detected)).toBe(true);
  });
});

describe("skillDestinations", () => {
  test("scope project apunta a ./.claude y ./.agents", () => {
    const dests = skillDestinations("project", tmpCwd, tmpHome);
    expect(dests.find((d) => d.harness === "claude")?.path).toBe(
      join(tmpCwd, ".claude", "skills", "importar-movimientos")
    );
    expect(dests.find((d) => d.harness === "codex")?.path).toBe(
      join(tmpCwd, ".agents", "skills", "importar-movimientos")
    );
  });

  test("scope global apunta a ~/.claude y ~/.agents", () => {
    const dests = skillDestinations("global", tmpCwd, tmpHome);
    expect(dests.find((d) => d.harness === "claude")?.path).toBe(
      join(tmpHome, ".claude", "skills", "importar-movimientos")
    );
    expect(dests.find((d) => d.harness === "codex")?.path).toBe(
      join(tmpHome, ".agents", "skills", "importar-movimientos")
    );
  });
});

describe("runInstall (no interactivo)", () => {
  test("escribe config global y copia la skill a claude y codex", async () => {
    const result = await runInstall(
      {
        yes: true,
        scope: "global",
        harnesses: "claude,codex",
        provider: "google",
        model: "gemini-2.5-pro",
      },
      { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
    );

    expect(existsSync(result.configPath)).toBe(true);
    const configContent = readFileSync(result.configPath, "utf-8");
    expect(configContent).toContain('provider = "google"');
    expect(configContent).toContain('model = "gemini-2.5-pro"');

    for (const skillPath of result.skillPaths) {
      expect(existsSync(join(skillPath, "SKILL.md"))).toBe(true);
    }
    expect(result.skillPaths.length).toBe(2);
  });

  test("crea los directorios de datos declarados en [paths]", async () => {
    const result = await runInstall(
      { yes: true, scope: "global", harnesses: "claude", provider: "anthropic" },
      { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
    );
    const configContent = readFileSync(result.configPath, "utf-8");
    expect(configContent).toContain("[paths]");
    const parsed = Bun.TOML.parse(configContent) as { paths: Record<string, string> };
    for (const dir of Object.values(parsed.paths)) {
      const expanded = dir.replace("~", tmpHome);
      expect(existsSync(expanded)).toBe(true);
    }
  });

  test("mensaje de env var faltante contiene [aviso] y el configPath", async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY;
    // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
    delete process.env.ANTHROPIC_API_KEY;
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (msg: string) => logs.push(msg);
    try {
      await runInstall(
        { yes: true, scope: "global", harnesses: "claude", provider: "anthropic" },
        { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
      );
    } finally {
      console.log = originalLog;
      // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
      if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
      else process.env.ANTHROPIC_API_KEY = originalKey;
    }
    const avisoLine = logs.find((l) => l.includes("[aviso]"));
    expect(avisoLine).toBeDefined();
    expect(avisoLine).toContain(join(tmpHome, ".config/mitarasca/config.toml"));
  });
});

describe("runInstall (guard de config existente)", () => {
  test("--yes sin config previo escribe normal", async () => {
    const result = await runInstall(
      { yes: true, scope: "global", harnesses: "claude", provider: "anthropic" },
      { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
    );
    expect(existsSync(result.configPath)).toBe(true);
  });

  test("--yes con config previo sin --force rechaza mencionando --force", async () => {
    await runInstall(
      { yes: true, scope: "global", harnesses: "claude", provider: "anthropic" },
      { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
    );
    await expect(
      runInstall(
        { yes: true, scope: "global", harnesses: "claude", provider: "anthropic" },
        { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
      )
    ).rejects.toThrow(/--force/);
  });

  test("--yes --force con config previo escribe y deja backup .bak-<timestamp>", async () => {
    const first = await runInstall(
      { yes: true, scope: "global", harnesses: "claude", provider: "anthropic" },
      { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
    );
    const second = await runInstall(
      { yes: true, scope: "global", harnesses: "claude", provider: "google", force: true },
      { cwd: tmpCwd, home: tmpHome, skillSourceDir: tmpSkillSource }
    );
    expect(second.configPath).toBe(first.configPath);
    const configDir = join(second.configPath, "..");
    const files = readdirSync(configDir);
    expect(files.some((f) => f.startsWith("config.toml.bak-"))).toBe(true);
    const configContent = readFileSync(second.configPath, "utf-8");
    expect(configContent).toContain('provider = "google"');
  });
});
