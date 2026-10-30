import { describe, expect, test } from "bun:test";
import {
  applyReplacements,
  isInManifest,
  outsideManifest,
  parseManifest,
  parseReplacements,
  parseVersion,
  symlinkEscapes,
} from "./public-sync";

describe("parseManifest", () => {
  test("ignora comentarios y líneas vacías y normaliza ./ y / final", () => {
    const text = "# público\nREADME.md\n\n./packages/core/  # dominio\npackages/cli\nREADME.md\n";
    expect(parseManifest(text)).toEqual(["README.md", "packages/core", "packages/cli"]);
  });

  test("rechaza rutas absolutas, con .. o .git", () => {
    expect(() => parseManifest("/etc/passwd")).toThrow();
    expect(() => parseManifest("docs/../data")).toThrow();
    expect(() => parseManifest(".")).toThrow();
    expect(() => parseManifest(".git/config")).toThrow();
  });

  test("rechaza un manifest vacío", () => {
    expect(() => parseManifest("# nada\n\n")).toThrow();
  });
});

describe("isInManifest / outsideManifest", () => {
  const entries = ["README.md", "packages/core"];

  test("acepta la ruta exacta y lo que está debajo de una carpeta", () => {
    expect(isInManifest("README.md", entries)).toBe(true);
    expect(isInManifest("packages/core/src/index.ts", entries)).toBe(true);
  });

  test("no confunde prefijos de nombre", () => {
    expect(isInManifest("packages/core-extra/a.ts", entries)).toBe(false);
    expect(isInManifest("README.md.bak", entries)).toBe(false);
  });

  test("devuelve solo las rutas fuera del manifest", () => {
    const paths = ["README.md", "packages/core/a.ts", "data/real.db", "packages/web/x.vue"];
    expect(outsideManifest(paths, entries)).toEqual(["data/real.db", "packages/web/x.vue"]);
  });
});

describe("parseVersion", () => {
  test("acepta X.Y.Z con o sin v", () => {
    expect(parseVersion("1.2.3")).toBe("1.2.3");
    expect(parseVersion("v0.10.0")).toBe("0.10.0");
  });

  test("rechaza otros formatos", () => {
    expect(() => parseVersion("1.2")).toThrow();
    expect(() => parseVersion("1.2.3-beta")).toThrow();
  });
});

describe("symlinkEscapes", () => {
  test("acepta un symlink relativo que queda dentro del repo", () => {
    expect(symlinkEscapes("/repo", "/repo/a/link", "../b/x")).toBe(false);
  });

  test("rechaza un destino absoluto o que sale del repo", () => {
    expect(symlinkEscapes("/repo", "/repo/a/link", "/repo/b/x")).toBe(true);
    expect(symlinkEscapes("/repo", "/repo/a/link", "../../otro")).toBe(true);
    expect(symlinkEscapes("/repo", "/repo/a/link", "../../repo-extra/x")).toBe(true);
  });
});

describe("parseReplacements y applyReplacements", () => {
  test("aplica las reglas en orden, todas las apariciones, ignorando comentarios", () => {
    const rules = parseReplacements(
      "# x\n/srv/app-demo => /srv/a\n\n/srv/app => /srv/b  # general\n"
    );
    expect(rules).toEqual([
      ["/srv/app-demo", "/srv/a"],
      ["/srv/app", "/srv/b"],
    ]);
    expect(applyReplacements("/srv/app-demo y /srv/app/x y /srv/app-demo", rules)).toBe(
      "/srv/a y /srv/b/x y /srv/a"
    );
  });

  test("rechaza una línea sin separador o con búsqueda vacía", () => {
    expect(() => parseReplacements("sin separador")).toThrow();
    expect(() => parseReplacements(" => algo")).toThrow();
  });
});
