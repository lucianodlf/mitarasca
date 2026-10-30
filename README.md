<a id="readme-top"></a>

[![CI][ci-shield]][ci-url]
[![License: MIT][license-shield]][license-url]

<br />
<div align="center">
  <h1>MiTarasca</h1>
  <p align="center">
    La plata que se va, con nombre y apellido.
    <br />
    <em>Movimientos, deudas y cuotas, balance mensual y anual. Todo en un SQLite que es tuyo.</em>
    <br />
    <br />
    <a href="https://mitarasca.demo.lucianodlf.com.ar"><strong>Ver la demo</strong></a>
    ·
    <a href="./docs/features.md">Features</a>
    ·
    <a href="#quickstart">Quickstart</a>
  </p>
</div>

## Tabla de contenidos

- [Sobre el proyecto](#sobre-el-proyecto)
- [Capturas](#capturas)
- [Qué hace hoy](#qué-hace-hoy)
- [Quickstart](#quickstart)
- [Uso](#uso)
- [Arquitectura](#arquitectura)
- [Estado del proyecto](#estado-del-proyecto)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## Sobre el proyecto

En el Río de la Plata, la *tarasca* es la plata que hay que pagar. MiTarasca no promete
que vas a tener más plata: te muestra de frente lo que se va todos los meses, con nombre y
apellido. Qué es fijo, qué es variable, qué está pagado y qué está adeudado.

Los datos viven en un archivo SQLite en tu máquina. Sin cuenta, sin nube obligatoria.

La [demo](https://mitarasca.demo.lucianodlf.com.ar) corre con datos inventados.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Capturas

![Egresos del mes con tags, estado y prorrateo](docs/img/egresos.png)

![Balance anual proyectado](docs/img/balance.png)

![Deudas con cuotas, totales por medio de pago y por persona](docs/img/deudas.png)

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Qué hace hoy

- **Movimientos con contexto**: ingresos y egresos clasificados con tags en cinco
  dimensiones (tipo, concepto, estado, medio de pago y persona).
- **Prorrateo**: el monto que pagaste y el que te toca, guardados por separado.
- **Template mensual de fijos**: genera el mes nuevo a partir del anterior.
- **Deudas en las dos direcciones** (*yo debo* y *me deben*), con cuotas automáticas,
  vínculo cuota y movimiento al pagar, y deudas compartidas.
- **Balance** proyectado, real y con estimación de variables futuras.
- **Cuatro puertas al mismo dominio**: web, CLI, MCP (18 tools para asistentes de IA) y
  API tRPC.
- **Importación desde capturas** de una billetera virtual (experimental).

Detalle de cada feature, su madurez y sus limitaciones en
[`docs/features.md`](./docs/features.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Quickstart

Requiere [Bun](https://bun.sh) (probado con 1.4.4).

```bash
git clone https://github.com/lucianodlf/mitarasca.git
cd mitarasca
bun install
bun run db:seed:demo      # genera ./data/demo.db con datos inventados
```

Levantar la API y la web contra la demo, en dos terminales desde la raíz del repo:

```bash
DB_PATH=$PWD/data/demo.db bun run dev:api   # API en http://localhost:3787
bun run dev:web                             # web en http://localhost:5173
```

Abrir http://localhost:5173.

Para empezar con una base vacía (migraciones y tags base en `./data/mitarasca.db`):

```bash
bun run db:init
bun run dev:api
bun run dev:web
```

Atajos: `bun run dev:demo` y `bun run dev` levantan la API y la web con un solo comando.
Con algunas versiones de Bun solo arranca la API; en ese caso, usar las dos terminales.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Uso

```bash
# CLI desde el repo (usa la base de .mitarasca/config.toml, o DB_PATH si está seteado)
bun run --cwd packages/cli dev -- --help
bun run --cwd packages/cli dev -- movimientos --mes 2026-10
bun run --cwd packages/cli dev -- balance --year 2026

# Typecheck, lint y tests
bun run typecheck
bun run lint
cd packages/core && bun test
```

Variables de entorno: `DB_PATH` (si se usa, con ruta absoluta) y `API_PORT` (default `3787`).

Guías de instalación e integración, con el nivel de madurez de cada una:

- [CLI](./docs/guias/cli.md): desde el código fuente, con `bun link` o un alias.
- [MCP](./docs/guias/mcp.md): Claude Code y Claude Desktop.
- [Skill `importar-movimientos`](./docs/guias/importar-movimientos.md) (experimental).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Arquitectura

Monorepo Bun workspaces con un paquete de dominio puro consumido por tres frontends y una
SPA:

```
packages/core   → dominio + SQLite/Drizzle (sin HTTP, sin framework)
packages/api    → expone core vía tRPC sobre Hono
packages/cli    → expone core vía comandos commander (in-process)
packages/mcp    → expone core vía MCP tools (stdio, in-process)
packages/web    → SPA Vue 3 que consume packages/api por HTTP (tRPC client)
```

Las reglas de negocio viven solo en `core`; los demás paquetes traducen su entrada a las
funciones del dominio. Más detalle en [`docs/architecture.md`](./docs/architecture.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Estado del proyecto

Proyecto personal, publicado para portfolio. La web y la API son la forma
principal de uso. El CLI y el MCP cubren lectura y escritura de movimientos y deudas, con
algunas partes experimentales. La importación desde capturas está ajustada a un caso de uso
propio. El estado de cada parte está en [`docs/features.md`](./docs/features.md).

Todavía no hay paquete publicado en npm ni instalador: se usa desde un clon del repo.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Contribuir

Es un proyecto personal, pero los issues y las contribuciones son bienvenidos. Antes de
proponer un cambio grande, abrí un issue para charlarlo.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Licencia

Distribuido bajo la licencia MIT. Ver [`LICENSE`](./LICENSE).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

[ci-shield]: https://github.com/lucianodlf/mitarasca/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/lucianodlf/mitarasca/actions/workflows/ci.yml
[license-shield]: https://img.shields.io/badge/license-MIT-blue.svg
[license-url]: ./LICENSE
