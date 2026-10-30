import type { MovementDirection, TagAlcance, TagKind } from "../db/schema.js";

export type TagRef = { kind: TagKind };

export type CardinalityError =
  | { code: "MISSING_TIPO" }
  | { code: "MULTIPLE_ESTADO"; count: number }
  | { code: "MISSING_ESTADO" };

export type CardinalityResult = { ok: true } | { ok: false; errors: CardinalityError[] };

export function validateMovementTags(tagRefs: TagRef[]): CardinalityResult {
  const errors: CardinalityError[] = [];

  const tipoCount = tagRefs.filter((t) => t.kind === "tipo").length;
  const estadoCount = tagRefs.filter((t) => t.kind === "estado").length;

  if (tipoCount < 1) errors.push({ code: "MISSING_TIPO" });
  if (estadoCount === 0) errors.push({ code: "MISSING_ESTADO" });
  if (estadoCount > 1) errors.push({ code: "MULTIPLE_ESTADO", count: estadoCount });

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

export type DireccionAlcanceError = {
  code: "ALCANCE_INCOMPATIBLE";
  tagId: number;
  alcance: TagAlcance;
};

export function validateTagsAlcanceForDireccion(
  tagRefs: { id: number; alcance: TagAlcance }[],
  direccion: MovementDirection
): { ok: true } | { ok: false; errors: DireccionAlcanceError[] } {
  const esperado: TagAlcance = direccion === "in" ? "ingreso" : "egreso";
  const errors = tagRefs
    .filter((t) => t.alcance !== "general" && t.alcance !== esperado)
    .map((t) => ({ code: "ALCANCE_INCOMPATIBLE" as const, tagId: t.id, alcance: t.alcance }));
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
