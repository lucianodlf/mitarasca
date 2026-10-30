import { describe, expect, test } from "bun:test";
import { diceCoefficient, normalizeDetalle } from "./text-similarity.js";

describe("normalizeDetalle", () => {
  test("pasa a minúsculas", () => {
    expect(normalizeDetalle("Super COTO")).toBe("super coto");
  });

  test("colapsa espacios internos y recorta los extremos", () => {
    expect(normalizeDetalle("  Delfino,   Luciano  Ja ")).toBe("delfino, luciano ja");
  });

  test("es idempotente", () => {
    const once = normalizeDetalle("  Transf.   MERPAGO ");
    expect(normalizeDetalle(once)).toBe(once);
  });
});

describe("diceCoefficient", () => {
  test("strings idénticos dan 1", () => {
    expect(diceCoefficient("mercado pago", "mercado pago")).toBe(1);
  });

  test("es insensible a mayúsculas y espacios", () => {
    expect(diceCoefficient("Mercado  Pago", "mercado pago")).toBe(1);
  });

  test("strings sin trigramas en común dan 0", () => {
    expect(diceCoefficient("abcdef", "xyzwvu")).toBe(0);
  });

  test("no penaliza diferencias de longitud como lo haría Levenshtein", () => {
    // 'merpago' está contenido conceptualmente en la descripción larga:
    // el score debe ser mayor que cero, que es lo que el nivel 2 necesita para ordenar.
    expect(diceCoefficient("merpago", "mercado pago - cobro comercio")).toBeGreaterThan(0);
  });

  test("es simétrico", () => {
    const a = diceCoefficient("facturacion junio", "transf. merpago");
    const b = diceCoefficient("transf. merpago", "facturacion junio");
    expect(a).toBe(b);
  });

  test("strings más cortos que un trigrama se comparan por igualdad", () => {
    expect(diceCoefficient("ab", "ab")).toBe(1);
    expect(diceCoefficient("ab", "cd")).toBe(0);
  });

  test("dos strings vacíos dan 1", () => {
    expect(diceCoefficient("", "")).toBe(1);
  });
});
