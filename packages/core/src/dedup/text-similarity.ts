/** Minúsculas, espacios internos colapsados, sin espacios en los extremos. */
export function normalizeDetalle(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Multiconjunto de trigramas de un string normalizado. */
function trigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3));
  return out;
}

/**
 * Coeficiente de Sørensen-Dice sobre trigramas: 2·|A ∩ B| / (|A| + |B|).
 * Se elige sobre Levenshtein porque no penaliza que un string sea mucho más
 * largo que el otro ("merpago" vs "mercado pago - cobro comercio").
 */
export function diceCoefficient(a: string, b: string): number {
  const na = normalizeDetalle(a);
  const nb = normalizeDetalle(b);
  if (na === nb) return 1;

  const ta = trigrams(na);
  const tb = trigrams(nb);
  // ponytail: strings de menos de 3 chars no producen trigramas; sin este guard
  // el denominador es 0. Comparar por igualdad exacta es la respuesta correcta ahí.
  if (ta.length === 0 || tb.length === 0) return 0;

  const counts = new Map<string, number>();
  for (const t of ta) counts.set(t, (counts.get(t) ?? 0) + 1);

  let matches = 0;
  for (const t of tb) {
    const remaining = counts.get(t) ?? 0;
    if (remaining > 0) {
      counts.set(t, remaining - 1);
      matches++;
    }
  }

  return (2 * matches) / (ta.length + tb.length);
}
