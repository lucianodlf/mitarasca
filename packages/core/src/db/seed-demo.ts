import { existsSync, mkdirSync, rmSync } from "node:fs";
/**
 * Genera un dataset sintético de demo en DB_PATH (debe ser data/demo.db).
 * Idempotente: borra el archivo, corre las migraciones y recrea el dataset.
 *
 * Uso (desde la raíz del repo, con ruta absoluta para que drizzle-kit y
 * client.ts resuelvan el mismo archivo — ver discrepancia de DB_PATH entre
 * drizzle.config.ts (relativo al cwd) y client.ts (anclado a la raíz)):
 *   DB_PATH="$(pwd)/data/demo.db" bun packages/core/src/db/seed-demo.ts
 *
 * NUNCA correr sin DB_PATH explícito apuntando a demo.db (evita pisar mitarasca.db).
 */
import { dirname, isAbsolute } from "node:path";

const dbPath = process.env.DB_PATH;
if (!dbPath || !dbPath.includes("demo.db")) {
  console.error('DB_PATH debe apuntar explícitamente a un archivo "demo.db". Abortando.');
  process.exit(1);
}
if (!isAbsolute(dbPath)) {
  console.error(
    `DB_PATH debe ser una ruta absoluta (recibido: "${dbPath}"). Usar: DB_PATH="$(pwd)/data/demo.db"`
  );
  process.exit(1);
}

mkdirSync(dirname(dbPath), { recursive: true });

for (const suffix of ["", "-shm", "-wal"]) {
  const p = `${dbPath}${suffix}`;
  if (existsSync(p)) rmSync(p);
}

const migrate = Bun.spawnSync(["bun", "run", "--cwd", "packages/core", "db:migrate"], {
  env: { ...process.env, DB_PATH: dbPath },
  stdio: ["inherit", "inherit", "inherit"],
});
if (!migrate.success) {
  console.error("seed-demo.ts: fallo al migrar", dbPath);
  process.exit(1);
}

// Import dinámico DESPUÉS de migrar y con DB_PATH ya seteado
// (client.ts abre la conexión SQLite como singleton de módulo al importarse).
const {
  seed,
  getDb,
  createMovement,
  createDebt,
  listInstallmentsByDebt,
  toggleInstallmentEstado,
  createTag,
  listTagsByKind,
} = await import("@mitarasca/core");

// 1. Catálogo base (tags tipo/estado/concepto + preset "Compartido /2")
seed(getDb());

function tag(kind: "tipo" | "concepto" | "estado", nombre: string): number {
  const found = listTagsByKind(kind).find((t) => t.nombre === nombre);
  if (!found) throw new Error(`Tag no encontrado: ${kind}/${nombre}`);
  return found.id;
}

const tipoFijo = tag("tipo", "Fijo");
const tipoVariable = tag("tipo", "Variable");
const conceptoAlquiler = tag("concepto", "Alquiler");
const conceptoSuper = tag("concepto", "Super");
const conceptoLuz = tag("concepto", "Luz");
const conceptoGas = tag("concepto", "Gas");
const conceptoInternet = tag("concepto", "Internet/Celular");
const estadoPagado = tag("estado", "Pagado");

// 2. Tags ad-hoc de demo (medio_pago + persona, no cubiertos por seed())
const medioEfectivo = createTag({ kind: "medio_pago", nombre: "Efectivo", color: "#64748b" }).id;
const medioTarjeta = createTag({ kind: "medio_pago", nombre: "Tarjeta Visa", color: "#0ea5e9" }).id;
const personaFlia = createTag({ kind: "persona", nombre: "Familia Demo", color: "#c084fc" }).id;

// 3. Movements sueltos: 3 meses de ingresos (sueldo) y egresos genéricos
const meses = ["2026-05", "2026-06", "2026-07"];

for (const mes of meses) {
  createMovement(
    {
      fecha: `${mes}-01`,
      direccion: "in",
      monto_total: 850000,
      detalle: "Sueldo",
    },
    [tipoFijo, estadoPagado]
  );
  createMovement(
    {
      fecha: `${mes}-05`,
      direccion: "out",
      monto_total: 220000,
      detalle: "Alquiler",
    },
    [tipoFijo, conceptoAlquiler, medioTarjeta, estadoPagado]
  );
  createMovement(
    {
      fecha: `${mes}-10`,
      direccion: "out",
      monto_total: 95000,
      detalle: "Supermercado",
    },
    [tipoVariable, conceptoSuper, medioEfectivo, estadoPagado]
  );
  createMovement(
    {
      fecha: `${mes}-15`,
      direccion: "out",
      monto_total: 18000,
      detalle: "Factura de luz",
    },
    [tipoFijo, conceptoLuz, medioTarjeta, estadoPagado]
  );
  createMovement(
    {
      fecha: `${mes}-15`,
      direccion: "out",
      monto_total: 12000,
      detalle: "Factura de gas",
    },
    [tipoFijo, conceptoGas, medioTarjeta, estadoPagado]
  );
  createMovement(
    {
      fecha: `${mes}-20`,
      direccion: "out",
      monto_total: 25000,
      detalle: "Internet + celular",
    },
    [tipoFijo, conceptoInternet, medioTarjeta, estadoPagado]
  );
}

// 4. Debts con installments: createDebt ya genera installments + movements automáticamente
const prestamo = createDebt({
  descripcion: "Préstamo personal banco",
  direccion: "yo_debo",
  medio_pago_tag_id: medioTarjeta,
  persona_tag_id: personaFlia,
  importe_total: 300000,
  cant_cuotas: 6,
  fecha: "2026-04-01",
  fecha_inicio: "2026-04-01",
  frecuencia: "mensual",
});

const meDeben = createDebt({
  descripcion: "Le presté a un amigo",
  direccion: "me_deben",
  persona_tag_id: personaFlia,
  importe_total: 90000,
  cant_cuotas: 3,
  fecha: "2026-05-01",
  fecha_inicio: "2026-05-01",
  frecuencia: "mensual",
});

// 5. Marcar algunas installments como pagadas (historial mixto): las primeras
// 3 cuotas del préstamo y la primera de "me deben" ya vencieron y se pagaron.
const byNro = <T extends { nro: number }>(a: T, b: T) => a.nro - b.nro;

const prestamoInstallments = listInstallmentsByDebt(prestamo.id).sort(byNro);
for (const installment of prestamoInstallments.slice(0, 3)) {
  toggleInstallmentEstado(installment.id, installment.fecha_prevista);
}
const meDebenInstallments = listInstallmentsByDebt(meDeben.id).sort(byNro);
const primeraCuotaMeDeben = meDebenInstallments[0];
if (primeraCuotaMeDeben) {
  toggleInstallmentEstado(primeraCuotaMeDeben.id, primeraCuotaMeDeben.fecha_prevista);
}

console.log("seed-demo.ts: dataset de demo generado en", dbPath);
