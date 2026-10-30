/** Año y mes (1-12) actuales según la fecha local del sistema. */
export function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Rango ISO [primer día, último día] del mes (1-12) indicado. */
export function monthRange(year: number, month: number): { from: string; to: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** Parsea "YYYY-MM" a { year, month }. Lanza error si el formato es inválido. */
export function parseMes(mes: string): { year: number; month: number } {
  const match = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!match) {
    throw new Error(`Formato de mes inválido: "${mes}" (esperado YYYY-MM)`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`Mes inválido: "${mes}" (el mes debe estar entre 01 y 12)`);
  }
  return { year, month };
}
