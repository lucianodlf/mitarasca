# Features

Qué hace MiTarasca hoy, para qué sirve cada parte y qué limitaciones tiene.

Niveles de madurez usados acá:

- **Estable**: probado contra la base de demo, sin bugs conocidos que rompan el uso.
- **Experimental**: funciona, pero con bugs conocidos o limitaciones. Usar con cuidado.

## Movimientos

**Objetivo**: registrar ingresos y egresos con el contexto suficiente para entender a dónde
se va la plata.

- Cada movimiento tiene fecha, dirección (ingreso o egreso), monto, detalle y observación.
- Alta, edición y borrado desde la web, el CLI (`movimiento add|update|delete`) y el MCP.
- Listado por mes con filtros por tipo, concepto, persona, estado y texto (web), o por mes y
  dirección (CLI `movimientos`, MCP `listar_movimientos`).

Limitaciones:
- Moneda única. No hay multimoneda ni conversión.
- El borrado de un movimiento es definitivo, no lógico.

## Tags

**Objetivo**: clasificar cada movimiento en varias dimensiones en lugar de una categoría
única.

- Cinco tipos de tag: **tipo** (fijo o variable), **concepto**, **estado** (pagado o
  adeudado), **medio de pago** y **persona**.
- Cada tag tiene color y alcance (ingresos, egresos o ambos), y se puede desactivar sin
  perder el histórico.
- Validación de cardinalidad: tipo y estado son obligatorios en cada movimiento, y las
  combinaciones incoherentes se rechazan antes de guardar.
- `bun run db:init` crea un juego base de tags.

Limitaciones:
- Los tags se crean y editan solo desde la web. El CLI y el MCP los usan por nombre o por ID,
  pero no tienen comandos para listarlos ni crearlos.

## Prorrateo

**Objetivo**: separar lo que pagaste de lo que te toca. Si pagás una cuenta de 60.000 que se
divide entre tres, la salida de caja es 60.000 y tu gasto es 20.000.

- Cada movimiento guarda el monto total y una regla (`div`, `mul` o `none`) con un factor.
  El **monto efectivo** se calcula al guardar.
- El balance usa el monto efectivo.
- Se carga desde el formulario de la web y desde el CLI (`movimiento add --regla-op div --regla-factor 3`).

Limitaciones:
- Los presets de prorrateo existen en el dominio, pero todavía no se exponen en la web, el
  CLI ni el MCP.

## Template mensual de fijos

**Objetivo**: no volver a tipear todos los meses el alquiler, los servicios y las
suscripciones.

- Genera el mes a partir del anterior copiando solo los movimientos de tipo fijo, marcados
  como adeudados.
- Si el día no existe en el mes destino (el 31 en febrero), ajusta la fecha al último día.
- Es idempotente: correrlo dos veces no duplica movimientos.

Limitaciones:
- Disponible solo desde la web (vista de movimientos). El CLI y el MCP no lo exponen.

## Deudas y cuotas

**Objetivo**: seguir lo que debés y lo que te deben, con sus cuotas, sin llevar una
contabilidad aparte.

- Dos direcciones: *yo debo* y *me deben*.
- Cuotas generadas a partir del importe total y la cantidad de cuotas, con frecuencia
  mensual o cada N días.
- Al pagar una cuota se crea el movimiento correspondiente y quedan vinculados.
- Ajuste manual del total cuando difiere de la suma de cuotas (intereses, recargos).
- Deudas compartidas: a partir de una deuda propia se generan las deudas *me deben* de
  cada persona, por importe o por porcentaje.
- Totales por medio de pago y por persona, y proyección de cuotas por mes.

Estable desde la web y el MCP. Limitaciones del CLI:
- `deuda crear` y `deuda editar` reciben IDs numéricos de tags.
- `cuota pagar` y `cuota editar` son experimentales: ningún comando lista las cuotas ni sus
  IDs.
- `deuda borrar` es experimental: con `--json` la salida no es JSON válido.
- `deuda compartir` solo acepta importe por persona, no porcentaje.

## Balance

**Objetivo**: ver el mes y el año desde tres preguntas distintas.

- **Proyectado**: todo lo cargado, pagado o no.
- **Real**: solo lo pagado.
- **Con estimación de variables**: completa los meses futuros sin gastos variables con el
  promedio de los últimos seis meses reales.
- Desglose de ingresos, egresos y saldo por mes y por año.
- Disponible en la web, el CLI (`balance`, `balance --year`) y el MCP (`resumen_mensual`,
  `balance_anual`). También hay un informe en JSON o markdown (`informe`,
  `informe_financiero`).

Limitaciones:
- En el CLI, el balance mensual es solo del mes actual (no hay `--mes`).

## Web

SPA con sidebar, modo claro y oscuro, paleta de comandos (Cmd+K) y vistas de dashboard,
egresos, ingresos, balance, deudas y tags. Se comunica con la API por tRPC.

## CLI

**Objetivo**: consultar y cargar datos desde la terminal, y encadenar con otras
herramientas.

- Comandos estables: `movimientos`, `ultimo-movimiento`, `balance`, `informe`, `deudas`,
  `movimiento add|update|delete|import`, `deuda crear|editar` y `config get|set|path`.
- Salida `--json` en las consultas.
- Desde el repo se usa con `bun run --cwd packages/cli dev -- <comando>`.

Experimentales: `duplicados`, `imagenes-nuevas`, `deuda borrar`, `deuda compartir`,
`cuota pagar|editar`, `serve` y `ui`.

Instalación y uso: [`docs/guias/cli.md`](./guias/cli.md).

Limitaciones:
- Los errores de validación muestran el stack completo además del mensaje.
- No está publicado en npm: se usa desde un clon del repo.

## MCP

**Objetivo**: que un asistente de IA consulte y cargue tus datos con herramientas tipadas.

- 18 tools: 8 de lectura (movimientos, resumen mensual, informe, balance anual, deudas,
  deudas derivadas, cuotas por deuda, proyección de cuotas) y 10 de escritura (movimientos,
  deudas y cuotas).
- Transporte stdio, en el mismo proceso que el dominio.

Configuración para Claude Code y Claude Desktop: [`docs/guias/mcp.md`](./guias/mcp.md).

Experimental como integración:
- Hay que configurarlo a mano en el cliente MCP, apuntando a
  `bun <ruta-del-repo>/packages/mcp/src/index.ts`.
- `importar_movimientos`, `borrar_deuda` y `pagar_cuota` tienen bugs conocidos. Sin
  `tags`, `pagar_cuota` falla; con `tags: {}` funciona.
- No hay tools de tags.

## Importación (experimental)

**Objetivo**: cargar movimientos desde capturas de pantalla del historial de una billetera
virtual, sin tipearlos.

- Las capturas van a una carpeta de entrada. Una skill de Claude Code
  (`importar-movimientos`) extrae los movimientos y arma un lote JSON.
- El lote pasa primero por `movimiento import --dry-run`, que informa qué se va a crear,
  qué tags no matchean, qué movimientos quedan ocultos por reglas y cuáles parecen
  duplicados. No se escribe nada hasta confirmar.
- El import real es una única transacción. Las imágenes procesadas se archivan.

Guía de instalación y uso: [`docs/guias/importar-movimientos.md`](./guias/importar-movimientos.md).

Requisitos:
- Un agente con visión que cargue skills de Claude Code (probada con Claude Code).
- La CLI `mitarasca` en el PATH. Desde un clon, sin instalarla:
  `alias mitarasca="bun <ruta-del-repo>/packages/cli/src/index.ts"`.
- Los conceptos que usa la skill creados como tags (ver abajo).

Capturas de ejemplo, con datos inventados, y el lote esperado en
[`docs/examples/importar-movimientos/`](./examples/importar-movimientos/).

Limitaciones:
- Probada con una sola billetera virtual real (la del autor) y con las capturas de ejemplo.
  Otras billeteras pueden mostrar los movimientos de otra forma.
- Reglas ajustadas a esa billetera: los rendimientos diarios de una cuenta remunerada se
  consolidan en un solo movimiento, y todo se carga como variable y pagado.
- La lista de conceptos está fija en el prompt. La base vacía de `db:init` no tiene
  "Facturación", "Intereses" ni "Reintegro": el dry-run los reporta como no encontrados y,
  si se importa igual, esos movimientos quedan sin concepto. La demo sí los tiene.
- Sin año en la captura, se infiere a partir de la fecha de hoy; con capturas viejas puede
  fallar. Lo mismo con fechas relativas ("Hoy", "Ayer").
- Un movimiento consolidado que sale de varias capturas guarda el hash de una sola.
- Depende de comandos experimentales: `imagenes-nuevas` (falla si la carpeta de entrada no
  existe) y `duplicados` (marca como reflejo gastos distintos con el mismo monto en pocos
  días).
- No cubre: PDFs ni resúmenes de tarjeta, monedas distintas del peso, cuotas ni deudas (todo
  entra como movimiento suelto), ni medio de pago o persona.
- El tool MCP `importar_movimientos` no aplica las reglas de ocultamiento ni la detección de
  duplicados: preferir el CLI.
