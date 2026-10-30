import { describe, expect, test } from "bun:test";
import { isInteractive } from "./tui.js";

describe("isInteractive", () => {
  test("devuelve false en el entorno de test (sin TTY)", () => {
    expect(isInteractive()).toBe(false);
  });
});
