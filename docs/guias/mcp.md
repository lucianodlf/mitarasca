# Guía: MCP

El servidor MCP de MiTarasca le da a un asistente de IA (Claude Code, Claude Desktop u otro
cliente MCP) herramientas para consultar y cargar tus datos. Corre por stdio, en el mismo
proceso que el dominio.

Madurez: **experimental como integración**. Las tools de lectura y la mayoría de las de
escritura son estables, pero la configuración es manual y hay tools con bugs conocidos (ver
[Limitaciones](#limitaciones)). Detalle en [`docs/features.md`](../features.md#mcp).

## Antes de empezar

- Un clon del repo con `bun install` hecho (ver la [guía de la CLI](./cli.md)).
- La ruta absoluta al servidor: `<ruta-del-repo>/packages/mcp/src/index.ts`.
- La ruta absoluta a la DB. Pasarla siempre con `DB_PATH`: el cliente MCP lanza el servidor
  desde su propio directorio de trabajo, y sin `DB_PATH` la DB depende de ese directorio.

Para probar con la demo: `bun run db:seed:demo` y usar `<ruta-del-repo>/data/demo.db`.

**El MCP escribe.** 10 de las 18 tools crean, editan o borran movimientos y deudas, y
`eliminar_movimiento` borra de forma definitiva y no pide confirmación: depende de que el
cliente te pregunte antes de ejecutar. Antes de conectarlo a tu DB real, hacé un backup:

```bash
cp /ruta/a/mitarasca.db /ruta/a/backups/$(date +%Y%m%d)_mitarasca.db
```

## Claude Code

```bash
claude mcp add mitarasca -e DB_PATH=/ruta/absoluta/a/demo.db \
  -- bun /ruta/absoluta/al/repo/packages/mcp/src/index.ts

claude mcp list            # debe mostrar "mitarasca: ... Connected"
```

Por defecto queda en el scope `local` (solo el proyecto actual). Con `-s user` queda
disponible en todos los proyectos.

Probalo con una pregunta: "¿cuál es el resumen de octubre de 2026 en mitarasca?". Claude
usa `resumen_mensual` y responde con los datos de la DB.

## Claude Desktop

Abrir Settings, pestaña Developer, Edit Config. El archivo es
`~/Library/Application Support/Claude/claude_desktop_config.json` en macOS,
`%APPDATA%\Claude\claude_desktop_config.json` en Windows y
`~/.config/Claude/claude_desktop_config.json` en Linux. Agregar:

```json
{
  "mcpServers": {
    "mitarasca": {
      "command": "bun",
      "args": ["/ruta/absoluta/al/repo/packages/mcp/src/index.ts"],
      "env": {
        "DB_PATH": "/ruta/absoluta/a/demo.db"
      }
    }
  }
}
```

Cerrar Claude Desktop del todo y volver a abrirlo. Si no conecta, usar en `command` la ruta
absoluta de Bun (`which bun`): la app puede no tener tu PATH de la terminal. Los logs están
en `~/Library/Logs/Claude/mcp*.log` (macOS), `%APPDATA%\Claude\logs` (Windows) o
`~/.config/Claude/logs/mcp*.log` (Linux).

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
- No hay script de arranque ni registro automático: `mitarasca install` todavía no registra
  el servidor en ningún cliente.
