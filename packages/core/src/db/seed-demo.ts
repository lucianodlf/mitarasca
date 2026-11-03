// Genera una DB de demo con datos inventados que replican la estructura de la DB real
// (tags por kind, fijos mensuales, compartidos /2, deudas en cuotas).
// La usan `mitarasca demo` y `scripts/seed-demo.ts` (db:seed:demo, deploy de la demo).
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

const HOY = "2026-10-07";

// Guard: seedDemoDb BORRA la salida. Solo acepta archivos *demo*.db y nunca mitarasca.db
// (la DB real), tampoco vía symlink.
function assertDemoDb(path: string): void {
  const name = basename(path);
  if (name === "mitarasca.db" || !/demo.*\.db$/.test(name)) {
    throw new Error(
      `seed-demo: salida rechazada "${path}" (debe ser un *demo*.db, nunca mitarasca.db).`
    );
  }
}

/** Borra (si existe) y regenera la DB de demo en `outPath`. */
export function seedDemoDb(outPath: string): void {
  const out = resolve(outPath);
  assertDemoDb(out);
  if (existsSync(out)) {
    assertDemoDb(realpathSync(out));
    rmSync(out);
  }
  mkdirSync(dirname(out), { recursive: true });

  const sqlite = new Database(out);
  sqlite.run("PRAGMA foreign_keys = ON");
  migrate(drizzle(sqlite), {
    migrationsFolder: new URL("../../drizzle", import.meta.url).pathname,
  });

  // PRNG determinista para que la demo sea reproducible
  let s = 20261007;
  const rnd = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const between = (a: number, b: number) => Math.round(a + rnd() * (b - a));
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const round50 = (n: number) => Math.round(n / 50) * 50;

  // ---------- tags ----------
  const TAGS: [kind: string, nombre: string, color: string, alcance: string][] = [
    ["tipo", "Fijo", "#ffffff", "general"],
    ["tipo", "Variable", "#f59e0b", "general"],
    ["estado", "Pagado", "#22c55e", "general"],
    ["estado", "Adeudado", "#ef4444", "general"],
    ["estado", "Deshabilitado", "#241f31", "general"],
    ["concepto", "Gas", "#f97316", "egreso"],
    ["concepto", "Agua", "#38bdf8", "egreso"],
    ["concepto", "Luz", "#facc15", "egreso"],
    ["concepto", "Internet/Celular", "#818cf8", "egreso"],
    ["concepto", "Alquiler", "#a78bfa", "egreso"],
    ["concepto", "Terapia", "#f472b6", "egreso"],
    ["concepto", "Monot+Impuestos", "#fb923c", "egreso"],
    ["concepto", "Obra Social", "#34d399", "egreso"],
    ["concepto", "Super", "#4ade80", "egreso"],
    ["concepto", "Hogar/Autocuidado", "#63452c", "egreso"],
    ["concepto", "Gustos/Salidas", "#f43f5e", "egreso"],
    ["concepto", "Comida/Bebida", "#fb7185", "egreso"],
    ["concepto", "Varios", "#94a3b8", "general"],
    ["concepto", "Facturación", "#10b981", "ingreso"],
    ["concepto", "Reintegro", "#0ea5e9", "ingreso"],
    ["concepto", "Intereses", "#14b8a6", "ingreso"],
    ["concepto", "Ahorro/Inversion", "#57e389", "general"],
    ["concepto", "Costo/Trabajo", "#cdab8f", "general"],
    ["medio_pago", "T. Credito", "#99c1f1", "general"],
    ["medio_pago", "Transf/Efect", "#26a269", "general"],
    ["persona", "Sofi", "#99c1f1", "general"],
    ["persona", "Mati", "#8ff0a4", "general"],
    ["persona", "M. Pago", "#1c71d8", "general"],
    ["persona", "Naranja x", "#c64600", "general"],
  ];
  const insTag = sqlite.prepare("INSERT INTO tags (kind, nombre, color, alcance) VALUES (?,?,?,?)");
  const tagId = new Map<string, number>();
  for (const [kind, nombre, color, alcance] of TAGS) {
    const r = insTag.run(kind, nombre, color, alcance);
    tagId.set(nombre, Number(r.lastInsertRowid));
  }
  const T = (n: string): number => {
    const id = tagId.get(n);
    if (id === undefined) throw new Error(`tag inexistente: ${n}`);
    return id;
  };
  sqlite.run("INSERT INTO proration_presets (nombre, op, factor) VALUES ('Compartido /2','div',2)");

  // ---------- movimientos ----------
  const insMov = sqlite.prepare(
    `INSERT INTO movements (fecha, direccion, monto_total, regla_op, regla_factor, monto_efectivo, detalle, installment_id)
   VALUES (?,?,?,?,?,?,?,?)`
  );
  const insMT = sqlite.prepare(
    "INSERT OR IGNORE INTO movement_tags (movement_id, tag_id) VALUES (?,?)"
  );
  const insShare = sqlite.prepare(
    "INSERT INTO movement_shares (movement_id, persona_tag_id, pagado, fecha_pago) VALUES (?,?,?,?)"
  );

  interface Mov {
    fecha: string;
    dir: "in" | "out";
    monto: number;
    detalle: string;
    tipo: "Fijo" | "Variable";
    concepto: string;
    div2?: boolean; // compartido /2 con Sofi
    estado?: "Pagado" | "Adeudado" | "Deshabilitado";
    extra?: string[]; // tags medio_pago / persona
    installmentId?: number;
  }

  function addMov(m: Mov): number {
    const estado = m.estado ?? (m.fecha <= HOY ? "Pagado" : "Adeudado");
    const efectivo = m.div2 ? m.monto / 2 : m.monto;
    const r = insMov.run(
      m.fecha,
      m.dir,
      m.monto,
      m.div2 ? "div" : "none",
      m.div2 ? 2 : null,
      efectivo,
      m.detalle,
      m.installmentId ?? null
    );
    const id = Number(r.lastInsertRowid);
    for (const t of [m.tipo, estado, m.concepto, ...(m.extra ?? [])]) insMT.run(id, T(t));
    if (m.div2) {
      const pagado = estado === "Pagado";
      insShare.run(id, T("Sofi"), pagado ? 1 : 0, pagado ? addDays(m.fecha, between(1, 6)) : null);
    }
    return id;
  }

  function addDays(iso: string, n: number): string {
    const d = new Date(`${iso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const day = (y: number, m: number, d: number) => `${ym(y, m)}-${String(d).padStart(2, "0")}`;

  // Meses: jul-sep completos (historia), oct en curso (hoy = 7), nov-dic proyectados
  const MESES: [number, number][] = [
    [2026, 7],
    [2026, 8],
    [2026, 9],
    [2026, 10],
    [2026, 11],
    [2026, 12],
  ];
  const INFLACION = [1, 1.03, 1.06, 1.09, 1.12, 1.16];
  // Estacionalidad de servicios (gas sube en invierno, luz en verano)
  const GAS = [31000, 29500, 24800, 18900, 14200, 11800];
  const LUZ = [21500, 20800, 22300, 25100, 29800, 36500];
  const AGUA = [27200, 27200, 28600, 28600, 30100, 30100];

  MESES.forEach(([y, m], i) => {
    const k = INFLACION[i] ?? 1;
    const f = (base: number) => round50(base * k);

    // --- fijos ---
    addMov({
      fecha: day(y, m, 5),
      dir: "out",
      monto: i < 5 ? 325000 : 357500,
      detalle: "Alquiler",
      tipo: "Fijo",
      concepto: "Alquiler",
    });
    addMov({
      fecha: day(y, m, 10),
      dir: "out",
      monto: GAS[i] ?? 0,
      detalle: "Litoral Gas",
      tipo: "Fijo",
      concepto: "Gas",
      div2: true,
    });
    addMov({
      fecha: day(y, m, 12),
      dir: "out",
      monto: AGUA[i] ?? 0,
      detalle: "Aguas Santafesinas",
      tipo: "Fijo",
      concepto: "Agua",
      div2: true,
    });
    addMov({
      fecha: day(y, m, 15),
      dir: "out",
      monto: LUZ[i] ?? 0,
      detalle: "EPE (Santa Fe)",
      tipo: "Fijo",
      concepto: "Luz",
      div2: true,
    });
    addMov({
      fecha: day(y, m, 10),
      dir: "out",
      monto: f(15800),
      detalle: "Internet Hogar",
      tipo: "Fijo",
      concepto: "Internet/Celular",
      div2: true,
    });
    addMov({
      fecha: day(y, m, 18),
      dir: "out",
      monto: f(61500),
      detalle: "Monotributo (Arca)",
      tipo: "Fijo",
      concepto: "Monot+Impuestos",
    });
    addMov({
      fecha: day(y, m, 18),
      dir: "out",
      monto: f(23800),
      detalle: "IB Mensual (Reg. Simp) (Arca)",
      tipo: "Fijo",
      concepto: "Monot+Impuestos",
    });
    addMov({
      fecha: day(y, m, 8),
      dir: "out",
      monto: f(74200),
      detalle: "Obra Social (Sancor Salud)",
      tipo: "Fijo",
      concepto: "Obra Social",
    });
    addMov({
      fecha: day(y, m, 3),
      dir: "out",
      monto: f(32000),
      detalle: "Yoga",
      tipo: "Fijo",
      concepto: "Varios",
    });
    addMov({
      fecha: day(y, m, 20),
      dir: "out",
      monto: f(96000),
      detalle: "Tarjeta Naranja X",
      tipo: "Fijo",
      concepto: "Varios",
      estado: "Deshabilitado",
    });

    // --- ingresos ---
    addMov({
      fecha: day(y, m, 10),
      dir: "in",
      monto: f(1350000),
      detalle: "Facturación Estudio Norte",
      tipo: "Fijo",
      concepto: "Facturación",
    });
    addMov({
      fecha: day(y, m, 20),
      dir: "in",
      monto: f(1080000) + (i === 2 ? 180000 : 0),
      detalle: "Facturación Tecno Andes",
      tipo: "Variable",
      concepto: "Facturación",
    });
    if (m !== 10 && m < 11) {
      addMov({
        fecha: day(y, m, 28),
        dir: "in",
        monto: between(8000, 14000),
        detalle: "Rendimientos",
        tipo: "Variable",
        concepto: "Intereses",
      });
    }
    if (m === 9)
      addMov({
        fecha: day(y, m, 14),
        dir: "in",
        monto: 9500,
        detalle: "Reintegro promo billetera",
        tipo: "Variable",
        concepto: "Reintegro",
      });

    // --- variables (solo hasta HOY) ---
    const ultimo = m === 10 ? 7 : 28;
    if (m <= 10) {
      addMov({
        fecha: day(y, m, Math.min(7, ultimo)),
        dir: "out",
        monto: f(90000),
        detalle: "Psicóloga (Lic. Paz)",
        tipo: "Variable",
        concepto: "Terapia",
      });
      const comercios: [string, string, number, number][] = [
        ["Super Dia Centro", "Super", 6000, 38000],
        ["Verdulería El Trébol", "Super", 3000, 9500],
        ["Panadería La Espiga", "Super", 1200, 6500],
        ["Dietética Granel", "Super", 4500, 14000],
        ["Carnicería Don Pedro", "Super", 9000, 26000],
        ["Farmacia del Sol", "Hogar/Autocuidado", 6000, 32000],
        ["Ferretería Sur", "Hogar/Autocuidado", 3500, 18000],
        ["Pizzería Napoli", "Comida/Bebida", 9000, 24000],
        ["Café Plaza", "Gustos/Salidas", 3500, 9000],
        ["Cine Centro", "Gustos/Salidas", 7000, 16000],
        ["Heladería Frío", "Gustos/Salidas", 2800, 7500],
        ["Kiosco 24hs", "Varios", 1500, 5200],
        ["Librería Norte", "Varios", 4000, 15000],
      ];
      const cant = m === 10 ? 7 : between(11, 13);
      for (let n = 0; n < cant; n++) {
        const [det, conc, lo, hi] = pick(comercios);
        addMov({
          fecha: day(y, m, between(1, ultimo)),
          dir: "out",
          monto: round50(between(lo, hi)),
          detalle: det,
          tipo: "Variable",
          concepto: conc,
        });
      }
    }
  });

  // ---------- deudas e installments ----------
  const insDebt = sqlite.prepare(
    `INSERT INTO debts (descripcion, direccion, medio_pago_tag_id, concepto_tag_id, persona_tag_id, parent_debt_id,
     importe_total, cant_cuotas, fecha, fecha_inicio, frecuencia, observacion)
   VALUES (?,?,?,?,?,?,?,?,?,?, 'mensual', ?)`
  );
  const insInst = sqlite.prepare(
    "INSERT INTO installments (debt_id, nro, importe, fecha_prevista, estado, fecha_pago) VALUES (?,?,?,?,?,?)"
  );
  const linkInst = sqlite.prepare("UPDATE installments SET movement_id = ? WHERE id = ?");

  function addMonths(iso: string, n: number): string {
    const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function createDebt(o: {
    descripcion: string;
    direccion: "yo_debo" | "me_deben";
    total: number;
    cuotas: number;
    inicio: string;
    persona: string;
    parent?: number;
    obs?: string;
  }): number {
    const medio = o.direccion === "yo_debo" ? T("T. Credito") : null;
    const r = insDebt.run(
      o.descripcion,
      o.direccion,
      medio,
      T(o.direccion === "yo_debo" ? "Varios" : "Reintegro"),
      T(o.persona),
      o.parent ?? null,
      o.total,
      o.cuotas,
      o.inicio,
      o.inicio,
      o.obs ?? null
    );
    const debtId = Number(r.lastInsertRowid);
    const importe = Math.round((o.total / o.cuotas) * 100) / 100;
    for (let n = 1; n <= o.cuotas; n++) {
      const fecha = addMonths(o.inicio, n - 1);
      const pagada = fecha <= HOY;
      const ir = insInst.run(
        debtId,
        n,
        importe,
        fecha,
        pagada ? "pagada" : "pendiente",
        pagada ? fecha : null
      );
      const instId = Number(ir.lastInsertRowid);
      const mov = addMov({
        fecha,
        dir: o.direccion === "yo_debo" ? "out" : "in",
        monto: importe,
        detalle: `Cta ${n}/${o.cuotas} - ${o.descripcion}`,
        tipo: "Variable",
        concepto: o.direccion === "yo_debo" ? "Varios" : "Reintegro",
        extra: o.direccion === "yo_debo" ? ["T. Credito", o.persona] : [],
        installmentId: instId,
      });
      linkInst.run(mov, instId);
    }
    return debtId;
  }

  createDebt({
    descripcion: "Notebook Lenovo",
    direccion: "yo_debo",
    total: 696000,
    cuotas: 12,
    inicio: "2026-07-12",
    persona: "Naranja x",
  });
  createDebt({
    descripcion: "Zapatillas running",
    direccion: "yo_debo",
    total: 51000,
    cuotas: 6,
    inicio: "2026-08-20",
    persona: "M. Pago",
  });
  createDebt({
    descripcion: "Curso online diseño",
    direccion: "yo_debo",
    total: 45000,
    cuotas: 3,
    inicio: "2026-09-25",
    persona: "Naranja x",
  });
  const padre = createDebt({
    descripcion: "Alimento mascotas (Sofi)",
    direccion: "yo_debo",
    total: 44000,
    cuotas: 2,
    inicio: "2026-10-05",
    persona: "M. Pago",
  });
  createDebt({
    descripcion: "Alimento mascotas (Sofi)",
    direccion: "me_deben",
    total: 44000,
    cuotas: 2,
    inicio: "2026-10-05",
    persona: "Sofi",
    parent: padre,
    obs: "Sofi reintegra la compra en 2 cuotas.",
  });

  sqlite.close();
}
