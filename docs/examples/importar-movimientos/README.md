# Ejemplo de importación desde capturas

Capturas inventadas de una billetera genérica, con datos ficticios, para probar la skill
`importar-movimientos` sin datos reales.

- `captura-1.png` y `captura-2.png`: historial de octubre con pagos, una transferencia
  recibida, dos pagos idénticos el mismo día y rendimientos diarios.
- `esperado.json`: el lote que la skill debería producir con estas capturas. Los
  rendimientos de los cuatro días quedan en un solo registro de 1236.27.

Probarlo contra la base de demo, desde la raíz del repo:

```bash
bun run db:seed:demo
mkdir -p data/inbox && cp docs/examples/importar-movimientos/captura-*.png data/inbox/
```

Con `.mitarasca/config.toml` apuntando a `./data/demo.db`, pedirle al agente "importar
movimientos". Para validar solo el lote, sin agente:

```bash
DB_PATH=$PWD/data/demo.db bun packages/cli/src/index.ts movimiento import \
  "$PWD/docs/examples/importar-movimientos/esperado.json" --dry-run
```

Las capturas no muestran el año: la skill lo infiere a partir de la fecha de hoy. El lote
esperado usa 2026.
