import { basename } from "node:path";
import { isNotNull } from "drizzle-orm";
import type { DbClient } from "../db/client.js";
import { movements } from "../db/schema.js";

export type ImageEntry = { path: string; nombre: string; hash: string };

/** SHA-256 hex del contenido del archivo. */
export async function hashFile(path: string): Promise<string> {
  const bytes = await Bun.file(path).arrayBuffer();
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
}

/**
 * Separa las imágenes ya procesadas de las nuevas comparando el hash del
 * contenido contra `movements.source_image_hash`.
 *
 * Un hash repetido dentro del mismo lote también cuenta como salteado: son el
 * mismo archivo con otro nombre, y procesarlo dos veces duplicaría todo su
 * contenido.
 */
export async function partitionImages(
  db: DbClient,
  paths: string[]
): Promise<{ nuevas: ImageEntry[]; salteadas: ImageEntry[] }> {
  const conocidos = new Set(
    db
      .selectDistinct({ hash: movements.source_image_hash })
      .from(movements)
      .where(isNotNull(movements.source_image_hash))
      .all()
      .map((r) => r.hash)
      .filter((h): h is string => h !== null)
  );

  const nuevas: ImageEntry[] = [];
  const salteadas: ImageEntry[] = [];

  for (const path of paths) {
    const entry: ImageEntry = { path, nombre: basename(path), hash: await hashFile(path) };
    if (conocidos.has(entry.hash)) {
      salteadas.push(entry);
    } else {
      conocidos.add(entry.hash);
      nuevas.push(entry);
    }
  }

  return { nuevas, salteadas };
}
