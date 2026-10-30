import { listTags } from "@mitarasca/core";
import type { Tag } from "@mitarasca/core";

// ── Types ─────────────────────────────────────────────────────────────────────

type MultiVal = string | string[];

export type TagsCreateInput = {
  tipo: string;
  estado: string;
  concepto?: MultiVal;
  persona?: MultiVal;
  medio_pago?: MultiVal;
};

export type TagsUpdateInput = {
  tipo?: string;
  estado?: string;
  /** null o ausente = no tocar; [] = borrar ese kind; valor = reemplazar */
  concepto?: MultiVal | null;
  persona?: MultiVal | null;
  medio_pago?: MultiVal | null;
};

export type TagsResolution = {
  tagIds: number[];
  skipped: string[]; // "kind:nombre" no encontrados (solo kinds opcionales)
};

// ── Interno ───────────────────────────────────────────────────────────────────

/**
 * Carga todos los tags activos de la DB y los indexa por kind → nombre_lower → Tag.
 * Map es apropiado: claves dinámicas desde datos de BD, acceso O(1), colección runtime.
 */
function buildTagIndex(): Map<string, Map<string, Tag>> {
  const all = listTags({ soloActivos: true });
  const idx = new Map<string, Map<string, Tag>>();
  for (const t of all) {
    let kindMap = idx.get(t.kind);
    if (!kindMap) {
      kindMap = new Map();
      idx.set(t.kind, kindMap);
    }
    kindMap.set(t.nombre.toLowerCase(), t);
  }
  return idx;
}

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Resuelve tags para CREATE.
 * - `tipo` y `estado`: obligatorios — lanza si no se encuentran.
 * - `concepto`, `persona`, `medio_pago`: opcionales — skip silencioso si no existen.
 */
export function resolveTagsForCreate(input: TagsCreateInput): TagsResolution {
  const idx = buildTagIndex();
  const ids: number[] = [];
  const skipped: string[] = [];

  for (const kind of ["tipo", "estado"] as const) {
    const nombre = input[kind];
    const found = idx.get(kind)?.get(nombre.toLowerCase());
    if (!found) throw new Error(`Tag ${kind}="${nombre}" no encontrado o inactivo`);
    ids.push(found.id);
  }

  for (const kind of ["concepto", "persona", "medio_pago"] as const) {
    const val = input[kind];
    if (val === undefined) continue;
    const kindMap = idx.get(kind);
    for (const nombre of Array.isArray(val) ? val : [val]) {
      const found = kindMap?.get(nombre.toLowerCase());
      if (found) ids.push(found.id);
      else skipped.push(`${kind}:${nombre}`);
    }
  }

  return { tagIds: ids, skipped };
}

/**
 * Resuelve tags para UPDATE dado el conjunto de tags existentes del movimiento.
 * - Si `tagsInput` es undefined → `{ tagIds: undefined }` (no modificar tags).
 * - `tipo`/`estado` si presentes: deben existir (lanza). No se pueden vaciar con [].
 * - `concepto`, `persona`, `medio_pago`:
 *     absent/null → conservar existentes
 *     []          → eliminar todos los de ese kind
 *     valor       → reemplazar (skip silencioso si no existe)
 */
export function resolveTagsForUpdate(
  tagsInput: TagsUpdateInput | undefined,
  existingTags: Tag[]
): { tagIds: number[] | undefined; skipped: string[] } {
  if (!tagsInput) return { tagIds: undefined, skipped: [] };

  const idx = buildTagIndex();
  const skipped: string[] = [];

  // Agrupar existentes por kind — Map porque se inserta/elimina en runtime
  const byKind = new Map<string, Tag[]>();
  for (const t of existingTags) {
    const bucket = byKind.get(t.kind) ?? [];
    bucket.push(t);
    byKind.set(t.kind, bucket);
  }

  for (const kind of ["tipo", "estado"] as const) {
    const nombre = tagsInput[kind];
    if (nombre === undefined) continue;
    const found = idx.get(kind)?.get(nombre.toLowerCase());
    if (!found) throw new Error(`Tag ${kind}="${nombre}" no encontrado o inactivo`);
    byKind.set(kind, [found]);
  }

  for (const kind of ["concepto", "persona", "medio_pago"] as const) {
    const val = tagsInput[kind];
    if (val === undefined || val === null) continue;

    if (Array.isArray(val) && val.length === 0) {
      byKind.delete(kind);
      continue;
    }

    const kindMap = idx.get(kind);
    const resolved: Tag[] = [];
    for (const nombre of Array.isArray(val) ? val : [val]) {
      const found = kindMap?.get(nombre.toLowerCase());
      if (found) resolved.push(found);
      else skipped.push(`${kind}:${nombre}`);
    }
    byKind.set(kind, resolved);
  }

  const tagIds = [...byKind.values()].flat().map((t) => t.id);
  return { tagIds, skipped };
}
