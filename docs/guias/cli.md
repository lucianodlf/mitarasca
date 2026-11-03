# Guía: CLI

La CLI `mitarasca` consulta y carga datos desde la terminal, en el mismo proceso que el
dominio y sin servidor.

Madurez: **estable** para las consultas, `movimiento add|update|delete|import`,
`deuda crear|editar` y `config`. **Experimental** para `duplicados`, `imagenes-nuevas`,
`deuda borrar`, `deuda compartir`, `cuota pagar|editar`, `serve`, `ui`, `demo`, `mcp` y
`uninstall`. Detalle en
[`docs/features.md`](../features.md#cli).

## Instalación

Solo Linux, desde un clon del repo (el paquete no está en npm todavía):

```bash
git clone https://github.com/lucianodlf/mitarasca.git
cd mitarasca
./scripts/install.sh
mitarasca --help
```

O sin clonar a mano: `curl -fsSL https://raw.githubusercontent.com/lucianodlf/mitarasca/main/scripts/install.sh | bash`
(clona en `~/.local/share/mitarasca`). El script verifica `git` y Bun, instala dependencias,
buildea la web, crea la base con `mitarasca init` y deja el symlink `~/.local/bin/mitarasca`.
Volver a correrlo actualiza; `mitarasca uninstall` quita el symlink sin borrar datos.

Sin instalar, desde la raíz del clon: `bun packages/cli/src/index.ts --help`.

## Base de datos y modo demo

```bash
mitarasca init              # crea tu base vacía, o la migra si ya existe
mitarasca demo              # siembra la demo si falta y abre la web (--reseed la regenera)
mitarasca balance --demo    # cualquier comando sobre la demo; igual con MITARASCA_DEMO=1
```

Solo `init` y `demo` crean archivos: si la base no existe, los demás comandos lo dicen y
salen con error.

La CLI resuelve la base en este orden:

1. `DB_PATH`, si está seteado. Usar siempre una ruta absoluta.
2. `--demo` o `MITARASCA_DEMO=1`: `data/demo.db` dentro del clon.
3. `db_path` del `.mitarasca/config.toml` más cercano subiendo desde el directorio actual.
   El del repo apunta a `./data/mitarasca.db`.
4. `db_path` de la config global, `~/.config/mitarasca/config.toml`.
5. Si no hay nada de lo anterior, `data/mitarasca.db` dentro del clon.

Para usar otra base desde cualquier directorio:

```bash
mitarasca config set db_path /ruta/absoluta/a/mitarasca.db   # escribe la config global
mitarasca config path                                         # muestra qué archivos lee
```

`config get` muestra el `db_path` de la config, no el efectivo: si `DB_PATH` está seteado,
manda `DB_PATH`.

## Web y servidores

```bash
mitarasca ui                # API + web en http://localhost:3787 y abre el navegador (alias: web)
mitarasca serve --port 4000 # lo mismo sin abrir el navegador (para systemd)
mitarasca mcp [--demo]      # servidor MCP por stdio, ver la guía del MCP
```

## Comandos principales

Consultas (todas aceptan `--json`):

```bash
mitarasca movimientos --mes 2026-10                 # movimientos de un mes
mitarasca movimientos --mes 2026-10 --direccion out # solo egresos
mitarasca balance                                   # mes actual
mitarasca balance --year 2026 --mode real           # año, solo lo pagado
mitarasca deudas                                    # deudas y totales por medio de pago y persona
mitarasca informe --formato md --desde 2026-07      # informe para análisis
```

Carga:

```bash
mitarasca movimiento add --fecha 2026-10-28 --direccion out --monto 5000 \
  --detalle "Café" --tag tipo:Variable --tag estado:Pagado --tag concepto:Varios

mitarasca movimiento add --fecha 2026-10-05 --direccion out --monto 60000 \
  --detalle "Luz" --regla-op div --regla-factor 3 \
  --tag tipo:Fijo --tag estado:Adeudado --tag concepto:Luz

mitarasca movimiento import lote.json --dry-run     # validar un lote sin escribir
mitarasca movimiento import lote.json               # importar en una transacción
```

Cada subcomando tiene su ayuda: `mitarasca movimiento add --help`.

## Limitaciones

- Los tags se pasan por nombre (`kind:nombre`) en movimientos y por ID numérico en deudas.
  No hay comando para listarlos: verlos en la web o con `--json` en las consultas.
- No hay comando para listar cuotas: sus IDs salen de `movimientos --json`
  (`installment_id`).
- `deuda borrar --json` no produce JSON válido: el dominio imprime una línea de log antes.
- `imagenes-nuevas` falla con un error crudo si la carpeta no existe.
- `duplicados` escribe hallazgos en la DB y marca como reflejo gastos distintos con el mismo
  monto en pocos días.
- Los errores muestran solo el mensaje; con `MITARASCA_DEBUG=1`, el stack completo.
- `install` (instalador interactivo) no está soportado todavía: usar `scripts/install.sh`.
