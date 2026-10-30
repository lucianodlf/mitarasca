# Guía: skill `importar-movimientos`

Una skill de Claude Code que lee capturas de pantalla del historial de una billetera virtual,
arma un lote de movimientos y lo importa con la CLI, mostrando antes un dry-run.

Madurez: **experimental**. Está ajustada a una billetera puntual. Se probó de punta a punta
invocada por Claude Code contra la base de demo, con las capturas inventadas de
[`docs/examples/importar-movimientos/`](../examples/importar-movimientos/): el lote generado
coincidió con el esperado. No se probó con capturas reales de otras billeteras.

## Requisitos

- Claude Code (u otro agente que cargue skills y lea imágenes).
- La CLI `mitarasca` en el PATH, con `bun link` o un alias (ver la [guía de la CLI](./cli.md)).
  La prueba de punta a punta se hizo con `bun link`.
- Los conceptos de la skill creados como tags. La demo los tiene todos; la base vacía de
  `bun run db:init` no tiene "Facturación", "Intereses" ni "Reintegro" (crearlos desde la
  web, en Tags).

## Instalación

Dentro del repo no hace falta nada: Claude Code carga la skill desde
`.claude/skills/importar-movimientos/`.

Para usarla desde otro proyecto, o en todos:

```bash
cp -r <ruta-del-repo>/.claude/skills/importar-movimientos ~/.claude/skills/
```

## Configuración

La skill toma las carpetas de `mitarasca config get --json`. El `.mitarasca/config.toml` del
repo usa:

```toml
[paths]
inbox = "./data/inbox"          # capturas nuevas
imports = "./data/imports"      # lotes JSON generados
processed = "./data/processed"  # capturas ya importadas, renombradas a su hash
backups = "./data/backups"      # backup de la DB antes de cada import
```

Se cambian con `mitarasca config set paths.inbox <ruta>`.

## Uso

1. Copiar las capturas en la carpeta `inbox`.
2. Pedirle a Claude Code "importar movimientos".
3. Revisar el dry-run: qué se va a crear, qué tags no se encontraron, qué movimientos quedan
   ocultos por reglas y cuáles ya existen.
4. Confirmar. La skill hace un backup de la DB, importa en una transacción, busca duplicados
   en el mes y mueve las capturas a `processed`.

Para probar sin datos propios, usar las capturas inventadas de
[`docs/examples/importar-movimientos/`](../examples/importar-movimientos/) contra la demo.

## Limitaciones

- Probada con una sola billetera real (la del autor). Otras pueden mostrar los movimientos
  de otra forma.
- Reglas propias de esa billetera: los rendimientos diarios se consolidan en un solo
  movimiento, y todo entra como variable y pagado, sin medio de pago ni persona.
- La lista de conceptos está fija en `prompt-extraccion.md`.
- Sin año en la captura, se infiere de la fecha de hoy; con capturas viejas puede fallar.
- Depende de comandos experimentales de la CLI:
  - `imagenes-nuevas` falla si la carpeta de entrada no existe (la skill la crea antes).
  - `config get` muestra el `db_path` de la config aunque `DB_PATH` esté seteado (la skill
    usa `DB_PATH` cuando existe, también para el backup).
  - `duplicados` marca como reflejo gastos distintos con el mismo monto en pocos días:
    revisar cada par antes de borrar nada.
- No cubre PDFs, resúmenes de tarjeta, otras monedas, cuotas ni deudas.
