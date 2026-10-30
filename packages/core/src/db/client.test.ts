import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tmpHome: string;
let tmpCwd: string;
const originalEnv: Record<string, string | undefined> = {};

function snapshotEnv(keys: string[]) {
  for (const k of keys) originalEnv[k] = process.env[k];
}
function restoreEnv() {
  for (const [k, v] of Object.entries(originalEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "mitarasca-home-"));
  tmpCwd = mkdtempSync(join(tmpdir(), "mitarasca-cwd-"));
  snapshotEnv(["DB_PATH", "HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "MITARASCA_INSTALLED"]);
  process.env.HOME = tmpHome;
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.XDG_DATA_HOME;
  delete process.env.MITARASCA_INSTALLED;
  delete process.env.DB_PATH;
});

afterEach(() => {
  restoreEnv();
  rmSync(tmpHome, { recursive: true, force: true });
  rmSync(tmpCwd, { recursive: true, force: true });
});

describe("resolveDbPath", () => {
  test("DB_PATH env tiene prioridad máxima", async () => {
    process.env.DB_PATH = "/explicit/path.db";
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    expect(resolveDbPath(tmpCwd)).toBe("/explicit/path.db");
  });

  test("sin DB_PATH, usa db_path del config si existe", async () => {
    const configDir = join(tmpHome, ".config", "mitarasca");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.toml"), `db_path = "${join(tmpHome, "cfg.db")}"\n`);
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    expect(resolveDbPath(tmpCwd)).toBe(join(tmpHome, "cfg.db"));
  });

  test("modo instalado sin config ni DB_PATH cae a XDG_DATA_HOME", async () => {
    process.env.MITARASCA_INSTALLED = "1";
    process.env.XDG_DATA_HOME = join(tmpHome, "xdgdata");
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    expect(resolveDbPath(tmpCwd)).toBe(join(tmpHome, "xdgdata", "mitarasca", "mitarasca.db"));
  });

  test("modo instalado sin XDG_DATA_HOME cae a ~/.local/share/mitarasca", async () => {
    process.env.MITARASCA_INSTALLED = "1";
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    expect(resolveDbPath(tmpCwd)).toBe(
      join(tmpHome, ".local", "share", "mitarasca", "mitarasca.db")
    );
  });

  test("modo dev (default) resuelve contra la raíz del repo", async () => {
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    const result = resolveDbPath(tmpCwd);
    expect(result.endsWith("data/mitarasca.db")).toBe(true);
    expect(result).not.toContain(tmpHome);
  });
});
