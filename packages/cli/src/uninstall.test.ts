import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runUninstall } from "./uninstall.js";

let tmp: string;
const ENV_KEYS = ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME"] as const;
const originalEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "mitarasca-uninstall-"));
  process.env.HOME = tmp;
  process.env.XDG_CONFIG_HOME = join(tmp, ".config");
  process.env.XDG_DATA_HOME = join(tmp, ".local", "share");
  mkdirSync(join(tmp, ".local", "bin"), { recursive: true });
  writeFileSync(join(tmp, "entry.ts"), "");
  writeFileSync(join(tmp, "otra.ts"), "");
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (originalEnv[k] === undefined) delete process.env[k];
    else process.env[k] = originalEnv[k];
  }
  rmSync(tmp, { recursive: true, force: true });
});

describe("runUninstall", () => {
  test("borra el symlink si apunta a este clon", () => {
    const bin = join(tmp, ".local", "bin", "mitarasca");
    symlinkSync(join(tmp, "entry.ts"), bin);
    const r = runUninstall({ binPath: bin, cliEntry: join(tmp, "entry.ts") });
    expect(r.linkRemoved).toBe(true);
    expect(existsSync(bin)).toBe(false);
  });

  test("no toca un symlink a otra instalación ni un archivo común", () => {
    const bin = join(tmp, ".local", "bin", "mitarasca");
    symlinkSync(join(tmp, "otra.ts"), bin);
    expect(runUninstall({ binPath: bin, cliEntry: join(tmp, "entry.ts") }).linkRemoved).toBe(false);
    expect(existsSync(bin)).toBe(true);
    rmSync(bin);
    writeFileSync(bin, "");
    expect(runUninstall({ binPath: bin, cliEntry: join(tmp, "entry.ts") }).linkRemoved).toBe(false);
    expect(existsSync(bin)).toBe(true);
  });

  test("lista la config global que existe", () => {
    mkdirSync(join(tmp, ".config", "mitarasca"), { recursive: true });
    const r = runUninstall({
      binPath: join(tmp, ".local", "bin", "mitarasca"),
      cliEntry: join(tmp, "entry.ts"),
    });
    expect(r.linkRemoved).toBe(false);
    expect(r.leftovers).toContain(join(tmp, ".config", "mitarasca"));
  });

  test("avisa de la línea de PATH en el rc sin modificarlo", () => {
    const rc = join(tmp, ".bashrc");
    const body = 'export PATH="$HOME/.local/bin:$PATH" # mitarasca\n';
    writeFileSync(rc, body);
    writeFileSync(join(tmp, ".zshrc"), "export FOO=1\n");
    const r = runUninstall({
      binPath: join(tmp, ".local", "bin", "mitarasca"),
      cliEntry: join(tmp, "entry.ts"),
    });
    expect(r.rcFiles).toEqual([rc]);
    expect(readFileSync(rc, "utf8")).toBe(body);
  });
});
