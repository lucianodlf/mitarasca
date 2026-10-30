const ars = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formatea un monto en pesos (es-AR), sin decimales. */
export function formatMoney(value: number): string {
  return ars.format(value);
}

/** Monto con signo explícito según dirección (in = +, out = -). */
export function formatSigned(value: number, direccion: "in" | "out"): string {
  const sign = direccion === "in" ? "+" : "−";
  return `${sign} ${ars.format(Math.abs(value))}`;
}

/** "2026-06-08" -> "08/06" */
export function formatDayMonth(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
