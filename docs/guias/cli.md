# Guía: CLI

La CLI `mitarasca` consulta y carga datos desde la terminal, en el mismo proceso que el
dominio y sin servidor.

Madurez: **estable** para las consultas, `movimiento add|update|delete|import`,
`deuda crear|editar` y `config`. **Experimental** para `duplicados`, `imagenes-nuevas`,
`deuda borrar`, `deuda compartir`, `cuota pagar|editar`, `serve` y `ui`. Detalle en
[`docs/features.md`](../features.md#cli).

## Instalación desde el código fuente

El paquete no está publicado en npm: se instala desde un clon del repo. Requiere
[Bun](https://bun.sh).

```bash
git clone https://github.com/lucianodlf/mitarasca.git
cd mitarasca
bun install
```

Después, una de estas dos opciones:

**`bun link`** (deja `mitarasca` en el PATH, en `~/.bun/bin`):

```bash
cd packages/cli
bun link
mitarasca --help
```

Para quitarlo: `bun unlink` en `packages/cli`.

**Alias** (solo en la shell actual, o en tu `~/.bashrc` / `~/.zshrc`):

```bash
alias mitarasca="bun $PWD/packages/cli/src/index.ts"   # desde la raíz del repo
mitarasca --help
```

## Elegir la base de datos

La CLI resuelve la DB en este orden:

1. `DB_PATH`, si está seteado. Usar siempre una ruta absoluta.
2. `db_path` del `.mitarasca/config.toml` más cercano subiendo desde el directorio actual.
   El del repo apunta a `./data/mitarasca.db`.
3. `db_path` de la config global, `~/.config/mitarasca/config.toml`.
4. Si no hay nada de lo anterior, `data/mitarasca.db` dentro del repo.

Para probar con la demo:

```bash
bun run db:seed:demo                        # desde la raíz del repo
export DB_PATH=$PWD/data/demo.db
mitarasca balance
```

Para usar siempre la misma DB desde cualquier directorio, fuera del repo:

```bash
mitarasca config set db_path /ruta/absoluta/a/mitarasca.db   # escribe la config global
mitarasca config path                                         # muestra qué archivos lee
```

`config get` muestra el `db_path` de la config, no el efectivo: si `DB_PATH` está seteado,
manda `DB_PATH`.

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
- Los errores de validación muestran el stack completo además del mensaje.
- `install` no está soportado todavía: depende de publicar el paquete.
