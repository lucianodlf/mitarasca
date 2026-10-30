import type { DuplicateNivel, Movement } from "@mitarasca/core";
import { formatDayMonth, formatSigned, formatTable } from "./format.js";

export type DedupFindingJson = {
  id: number;
  nivel: DuplicateNivel;
  nuevo: boolean;
  estado: string;
  motivo: string;
  score: number | null;
  detectado_en: string;
  diasDiff?: number;
  a: Movement;
  b: Movement | null;
};

export type DedupJsonOutput = {
  rango: { from: string; to: string };
  niveles: DuplicateNivel[];
  findings: DedupFindingJson[];
  resumen: { total: number; nuevos: number; existentes: number };
};

const TITULOS: Record<DuplicateNivel, string> = {
  exacto: "ESPEJO (exacto)",
  reglas: "REFLEJO (reglas)",
  criterio: "REFLEJO (criterio)",
};

/** Primeros 6 chars del hash, o "(manual)" si el movimiento no vino de una imagen. */
function origen(m: Movement): string {
  return m.source_image_hash ? m.source_image_hash.slice(0, 6) : "(manual)";
}

function seccionExacto(findings: DedupFindingJson[]): string {
  const rows: string[][] = [];
  for (const f of findings) {
    for (const m of [f.a, f.b]) {
      if (!m) continue;
      rows.push([
        String(m.id),
        formatDayMonth(m.fecha),
        m.direccion,
        formatSigned(m.monto_efectivo, m.direccion),
        m.detalle,
        origen(m),
      ]);
    }
  }
  return formatTable(["#", "Fecha", "Dir", "Monto", "Detalle", "Origen"], rows);
}

function seccionReglas(findings: DedupFindingJson[]): string {
  const rows: string[][] = [];
  for (const f of findings) {
    rows.push([
      String(f.a.id),
      formatDayMonth(f.a.fecha),
      f.a.direccion,
      formatSigned(f.a.monto_efectivo, f.a.direccion),
      f.a.detalle,
      f.diasDiff !== undefined ? String(f.diasDiff) : "-",
      f.score !== null ? f.score.toFixed(2) : "-",
    ]);
    if (f.b) {
      rows.push([
        String(f.b.id),
        formatDayMonth(f.b.fecha),
        f.b.direccion,
        formatSigned(f.b.monto_efectivo, f.b.direccion),
        f.b.detalle,
        "-",
        "-",
      ]);
    }
  }
  return formatTable(["#", "Fecha", "Dir", "Monto", "Detalle", "Δdías", "Texto"], rows);
}

export function renderDedupText(out: DedupJsonOutput): string {
  const cabecera = `Duplicados ${out.rango.from} → ${out.rango.to}  ·  niveles: ${out.niveles.join(", ")}`;

  if (out.findings.length === 0) {
    return `${cabecera}\n\nSin duplicados detectados (niveles: ${out.niveles.join(", ")}).`;
  }

  const bloques: string[] = [cabecera];
  for (const nivel of out.niveles) {
    const delNivel = out.findings.filter((f) => f.nivel === nivel);
    if (delNivel.length === 0) continue;
    bloques.push(`\n${TITULOS[nivel]} — ${delNivel.length} par(es)`);
    bloques.push(nivel === "exacto" ? seccionExacto(delNivel) : seccionReglas(delNivel));
  }

  bloques.push(
    `\n${out.resumen.total} finding(s) registrados (${out.resumen.nuevos} nuevos, ${out.resumen.existentes} ya existente(s)).`
  );
  return bloques.join("\n");
}
