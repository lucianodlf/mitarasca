# Guía: MCP

El servidor MCP de MiTarasca le da a un asistente de IA (Claude Code, Claude Desktop u otro
cliente MCP) herramientas para consultar y cargar tus datos. Corre por stdio, en el mismo
proceso que el dominio.

Madurez: **experimental como integración**. Las tools de lectura y la mayoría de las de
escritura son estables, pero la configuración es manual y hay tools con bugs conocidos (ver
[Limitaciones](#limitaciones)). Detalle en [`docs/features.md`](../features.md#mcp).

## Antes de empezar

- `mitarasca` instalado con `scripts/install.sh` (ver la [guía de la CLI](./cli.md)).
- `mitarasca mcp` es el servidor: usa tu base (`mitarasca init`) y `mitarasca mcp --demo`
  usa la demo (`mitarasca demo` la crea). Si la base no existe, el servidor arranca igual,
  lo avisa por stderr y cada tool devuelve el error con el comando a correr.

**El MCP escribe.** 10 de las 18 tools crean, editan o borran movimientos y deudas, y
`eliminar_movimiento` borra de forma definitiva y no pide confirmación: depende de que el
cliente te pregunte antes de ejecutar. Antes de conectarlo a tu DB real, hacé un backup:

```bash
cp /ruta/a/mitarasca.db /ruta/a/backups/$(date +%Y%m%d)_mitarasca.db
```

## Claude Code

```bash
# Scope user: disponible en todos tus proyectos (se guarda en ~/.claude.json)
claude mcp add -s user mitarasca -- mitarasca mcp --demo

# Scope project: solo este proyecto, compartible (se guarda en .mcp.json)
claude mcp add -s project mitarasca -- mitarasca mcp

claude mcp list            # debe mostrar "mitarasca: ... Connected"
```

Sin `-s` queda en el scope `local` (solo vos, en el proyecto actual). Sacar `--demo` cuando
quieras usar tu base. Referencia: [MCP en Claude Code](https://code.claude.com/docs/en/mcp).

Probalo con una pregunta: "¿cuál es el resumen de octubre de 2026 en mitarasca?". Claude
usa `resumen_mensual` y responde con los datos de la DB.

## Claude Desktop

Abrir Settings, pestaña Developer, Edit Config. El archivo es
`~/.config/Claude/claude_desktop_config.json` en Linux
(`~/Library/Application Support/Claude/claude_desktop_config.json` en macOS y
`%APPDATA%\Claude\claude_desktop_config.json` en Windows). Agregar:

```json
{
  "mcpServers": {
    "mitarasca": {
      "command": "/home/<usuario>/.bun/bin/bun",
      "args": ["/home/<usuario>/.local/share/mitarasca/packages/cli/src/index.ts", "mcp", "--demo"]
    }
  }
}
```

Claude Desktop no hereda el PATH de la terminal: `command` es la ruta absoluta de Bun
(`which bun`) y el primer arg es la ruta absoluta al `index.ts` de la CLI en la carpeta de
instalación (`readlink -f ~/.local/bin/mitarasca`). Sacar `"--demo"` para usar tu base.

Cerrar Claude Desktop del todo y volver a abrirlo. Los logs están en
`~/.config/Claude/logs/mcp*.log` (Linux), `~/Library/Logs/Claude/mcp*.log` (macOS) o
`%APPDATA%\Claude\logs` (Windows). Referencia:
[Connect to local MCP servers](https://modelcontextprotocol.io/docs/develop/connect-local-servers).

## Tools disponibles

Lectura:

| Tool | Qué hace |
|---|---|
| `listar_movimientos` | Movimientos de un rango de fechas (default: mes actual) |
| `resumen_mensual` | Ingresos, egresos y balance de un mes |
| `informe_financiero` | Informe por mes y concepto, en JSON o markdown |
| `balance_anual` | Balance de 12 meses, con estimación de variables opcional |
| `listar_deudas` | Deudas con totales por medio de pago y por persona |
| `listar_deudas_derivadas` | Deudas generadas al compartir una deuda |
| `cuotas_por_deuda` | Cuotas de una deuda |
| `proyeccion_cuotas_mes` | Cuotas que vencen en un mes |

Escritura:

| Tool | Qué hace | Madurez |
|---|---|---|
| `crear_movimiento` | Alta de un movimiento | Estable |
| `actualizar_movimiento` | Edición de un movimiento | Estable |
| `eliminar_movimiento` | Borrado definitivo, sin confirmación | Estable |
| `importar_movimientos` | Alta de un lote en una transacción | Experimental |
| `crear_deuda` | Alta de una deuda con sus cuotas | Estable |
| `editar_deuda` | Edición de una deuda | Estable |
| `borrar_deuda` | Borrado de una deuda | Experimental |
| `compartir_deuda` | Genera las deudas *me deben* por persona | Estable |
| `editar_cuota` | Edición de una cuota | Estable |
| `pagar_cuota` | Marca la cuota pagada y crea su movimiento | Experimental |

## Limitaciones

- `importar_movimientos` no aplica las reglas de ocultamiento, no detecta duplicados ni
  guarda el hash de la imagen. Para importar lotes, usar la CLI (`movimiento import`).
- `borrar_deuda` escribe una línea de log por stdout, que es el canal del protocolo. El SDK
  la descarta, pero un cliente estricto puede cortar la sesión.
- `pagar_cuota` falla sin `tags` (`MISSING_TIPO` o `MISSING_ESTADO`); con `tags: {}`
  funciona.
- No hay tools de tags: `crear_deuda` y `editar_deuda` reciben IDs numéricos, que se
  obtienen con `listar_deudas` o desde la web.
- No hay registro automático: el servidor se agrega a mano en cada cliente.
