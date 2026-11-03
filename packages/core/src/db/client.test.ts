import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
  snapshotEnv([
    "DB_PATH",
    "HOME",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "MITARASCA_INSTALLED",
    "MITARASCA_DEMO",
  ]);
  process.env.HOME = tmpHome;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  delete process.env.XDG_CONFIG_HOME;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  delete process.env.XDG_DATA_HOME;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  delete process.env.MITARASCA_INSTALLED;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  delete process.env.DB_PATH;
  // biome-ignore lint/performance/noDelete: asignar undefined deja el string "undefined" en process.env
  delete process.env.MITARASCA_DEMO;
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

  test("MITARASCA_DEMO=1 gana al config pero no a DB_PATH", async () => {
    const configDir = join(tmpHome, ".config", "mitarasca");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "config.toml"), `db_path = "${join(tmpHome, "cfg.db")}"\n`);
    process.env.MITARASCA_DEMO = "1";
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    expect(resolveDbPath(tmpCwd).endsWith("data/demo.db")).toBe(true);
    process.env.DB_PATH = "/explicit/path.db";
    expect(resolveDbPath(tmpCwd)).toBe("/explicit/path.db");
  });

  test("demo en modo instalado va a XDG_DATA_HOME/mitarasca/demo.db", async () => {
    process.env.MITARASCA_DEMO = "1";
    process.env.MITARASCA_INSTALLED = "1";
    const { resolveDbPath } = await import(`./client.js?t=${Date.now()}`);
    expect(resolveDbPath(tmpCwd)).toBe(join(tmpHome, ".local", "share", "mitarasca", "demo.db"));
  });
});

describe("getDb / ensureDb", () => {
  test("getDb sin archivo lanza DbNotFoundError y no crea nada", async () => {
    process.env.DB_PATH = join(tmpCwd, "sub", "mitarasca.db");
    const { getDb, DbNotFoundError } = await import(`./client.js?t=${Date.now()}`);
    expect(() => getDb()).toThrow(DbNotFoundError);
    expect(() => getDb()).toThrow("mitarasca init");
    expect(readdirSync(tmpCwd)).toEqual([]);
  });

  test("en modo demo el error sugiere mitarasca demo", async () => {
    process.env.DB_PATH = join(tmpCwd, "demo.db");
    process.env.MITARASCA_DEMO = "1";
    const { getDb } = await import(`./client.js?t=${Date.now()}`);
    expect(() => getDb()).toThrow("mitarasca demo");
  });

  test("ensureDb crea, migra y siembra; getDb después la abre", async () => {
    process.env.DB_PATH = join(tmpCwd, "sub", "mitarasca.db");
    const { ensureDb, getDb } = await import(`./client.js?t=${Date.now()}`);
    ensureDb();
    expect(existsSync(process.env.DB_PATH)).toBe(true);
    expect(getDb()).toBeDefined();
  });
});

describe("seedDemoDb", () => {
  test("rechaza mitarasca.db y nombres sin demo", async () => {
    const { seedDemoDb } = await import("./seed-demo.js");
    expect(() => seedDemoDb(join(tmpCwd, "mitarasca.db"))).toThrow("rechazada");
    expect(() => seedDemoDb(join(tmpCwd, "otra.db"))).toThrow("rechazada");
    expect(readdirSync(tmpCwd)).toEqual([]);
  });

  test("genera una demo con movimientos", async () => {
    const { seedDemoDb } = await import("./seed-demo.js");
    const out = join(tmpCwd, "data", "demo.db");
    seedDemoDb(out);
    const { Database } = await import("bun:sqlite");
    const db = new Database(out, { readonly: true });
    const row = db.query("SELECT count(*) AS n FROM movements").get() as { n: number };
    db.close();
    expect(row.n).toBeGreaterThan(0);
  });
});
