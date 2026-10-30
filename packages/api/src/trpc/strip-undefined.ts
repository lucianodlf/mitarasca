/**
 * Zod con `.optional()` produce `prop?: T | undefined`, que bajo
 * `exactOptionalPropertyTypes: true` no es asignable a los inputs del core
 * (que declaran `prop?: T`). Quitar las claves cuyo valor es `undefined` hace
 * el objeto compatible sin perder los valores presentes (incluido `null`).
 */
export function stripUndefined<T extends object>(
  obj: T
): {
  [K in keyof T]: Exclude<T[K], undefined>;
} {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}
