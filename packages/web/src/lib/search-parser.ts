import type { MovementWithTags } from "@/composables/useMovements";

export type ParsedQuery = {
  /** Dirección forzada por prefijo (egr: → "out", ing: → "in"). Null = usar contexto actual. */
  scope: "in" | "out" | null;
  /** Texto libre — cada token debe aparecer en el detalle (AND, case-insensitive). */
  freeText: string;
  /** Nombres de tags (AND semántico: todos deben estar presentes). */
  tags: string[];
  /** Filtros por kind específico: { estado: "pagado", tipo: "fijo" }. */
  kind: Record<string, string>;
};

const SCOPE_RE = /^(egr|ing):(.*)$/is;
const TAGS_RE = /^tags:(.+)$/i;
const KIND_KEYS = ["estado", "tipo", "concepto", "persona", "medio"];
const KIND_RE = new RegExp(`^(${KIND_KEYS.join("|")}):(.+)$`, "i");
// "medio" es alias de "medio_pago" en el schema
const KIND_ALIAS: Record<string, string> = { medio: "medio_pago" };

export function parseQuery(raw: string): ParsedQuery {
  const q: ParsedQuery = { scope: null, freeText: "", tags: [], kind: {} };
  let str = raw.trim();
  if (!str) return q;

  const scopeMatch = SCOPE_RE.exec(str);
  if (scopeMatch) {
    q.scope = scopeMatch[1].toLowerCase() === "egr" ? "out" : "in";
    str = scopeMatch[2].trim();
  }

  const free: string[] = [];
  for (const token of str.split(/\s+/)) {
    if (!token) continue;

    const tagsMatch = TAGS_RE.exec(token);
    if (tagsMatch) {
      q.tags.push(
        ...tagsMatch[1]
          .split(",")
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
      );
      continue;
    }

    const kindMatch = KIND_RE.exec(token);
    if (kindMatch) {
      const key = kindMatch[1].toLowerCase();
      q.kind[KIND_ALIAS[key] ?? key] = kindMatch[2].toLowerCase();
      continue;
    }

    free.push(token.toLowerCase());
  }

  q.freeText = free.join(" ");
  return q;
}

/** Verdadero si el movimiento satisface todos los criterios de la query parseada. */
export function matchesQuery(m: MovementWithTags, q: ParsedQuery): boolean {
  // Texto libre: tokenized substring en detalle + observacion
  if (q.freeText) {
    const tokens = q.freeText.split(/\s+/).filter(Boolean);
    const target = `${m.detalle} ${m.observacion ?? ""}`.toLowerCase();
    if (!tokens.every((t) => target.includes(t))) return false;
  }

  // Tags por nombre: todos deben estar presentes (AND)
  for (const name of q.tags) {
    if (!m.tags.some((t) => t.nombre.toLowerCase() === name)) return false;
  }

  // Filtros por kind específico
  for (const [kind, value] of Object.entries(q.kind)) {
    if (!m.tags.some((t) => t.kind === kind && t.nombre.toLowerCase() === value)) return false;
  }

  return true;
}
