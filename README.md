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
- [Modo desarrollo](#modo-desarrollo)
- [Docker](#docker)
- [MCP](#mcp)
- [Configuración avanzada](#configuración-avanzada)
- [Arquitectura](#arquitectura)
- [Estado del proyecto](#estado-del-proyecto)
- [Contribuir](#contribuir)
- [Licencia](#licencia)

## Sobre el proyecto

En el Río de la Plata, la *tarasca* es la plata que hay que pagar. MiTarasca no promete
que vas a tener más plata: te muestra de frente lo que se va todos los meses, con nombre y
apellido. Qué es fijo, qué es variable, qué está pagado y qué está adeudado.

Los datos viven en un archivo SQLite en tu máquina. Sin cuenta, sin nube obligatoria.

Es para quien quiere llevar sus finanzas personales (gastos, deudas, cuotas y balance) en
algo propio y local, y se maneja con la terminal: se instala con un script y corre con Bun.
<!-- OWNER: revisar la redacción de "para quién" (adaptada de PRODUCT.md:10). -->

> [!NOTE]
> El proyecto fue evolucionando con mis propias necesidades y gustos para registrar finanzas
> personales. Además de registrar ingresos y egresos, tiene MCP para conectar con agentes, CLI
> para automatizaciones, una skill para importar movimientos desde capturas de la billetera
> virtual que uses (experimental) y otras funciones por explorar. Se va modificando y no tiene
> garantía de compatibilidad hacia atrás, aunque es mi preferencia.
>
> Por ahora está pensado para usar en tu PC, con la base de datos local y sin versión mobile.
> Una opción mobile con sincronización de datos es una idea a futuro.

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
- **Prorrateo**: el monto que pagaste y el que te toca, guardados por separado. Para gastos compartidos.
- **Template mensual de fijos**: genera el mes nuevo a partir del anterior.
- **Deudas en las dos direcciones** (*yo debo* y *me deben*), con cuotas automáticas,
  vínculo cuota y movimiento al pagar, y deudas compartidas. Para llevar gastos con tarjetas, si le prestaste la tarjeta a alguien, si compran un regalo en grupo.
- **Balance** proyectado, real y con estimación de variables futuras.
- **Cuatro puertas al mismo dominio**: web, CLI, MCP (18 tools para asistentes de IA) y
  API tRPC.
- **Importación desde capturas** de una billetera virtual (experimental).

Detalle de cada feature, su madurez y sus limitaciones en
[`docs/features.md`](./docs/features.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Quickstart

> [!IMPORTANT]
> Hoy está orientado a Linux: el instalador corre solo en Linux. Si lo querés probar en
> Windows, seguro lo vas a poder resolver ;)

Requisitos: Linux, `git` y [Bun](https://bun.sh). Si falta Bun, el script ofrece
instalarlo, y para eso necesita `curl` y `unzip`.

Sin clonar a mano, la más simple (el script clona el repo en `~/.local/share/mitarasca`):

```bash
curl -fsSL https://raw.githubusercontent.com/lucianodlf/mitarasca/main/scripts/install.sh | bash
```

O clonando el repo:

```bash
git clone https://github.com/lucianodlf/mitarasca.git
cd mitarasca
./scripts/install.sh
```

El script instala las dependencias, buildea la web, crea tu base vacía con `mitarasca init`
y deja el comando `mitarasca` en `~/.local/bin`. Volver a correrlo actualiza. Si terminó
bien, imprime una línea como esta (con rutas absolutas; este es el caso de `curl`, si clonaste
a mano aparece tu carpeta):

```text
Listo: ~/.local/bin/mitarasca -> ~/.local/share/mitarasca/packages/cli/src/index.ts
```

<details>
<summary><code>mitarasca: command not found</code></summary>

`~/.local/bin` no está en tu PATH (el script lo avisa al final). Agregar esta línea a
`~/.bashrc` o `~/.zshrc` y abrir una terminal nueva:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

</details>

Después:

```bash
mitarasca demo      # siembra la base de demo (datos inventados) y abre la web
mitarasca ui        # abre la web con tu base (alias: mitarasca web)
mitarasca --help    # todos los comandos
```

`mitarasca demo` imprime `Demo generada:` con la ruta de la base de demo (la primera vez) y
`mitarasca corriendo en http://localhost:3787`, y abre esa dirección en el navegador. Lo que
se ve está en [Capturas](#capturas).

Cualquier comando acepta `--demo` para trabajar sobre la demo sin tocar tu base
(`mitarasca balance --demo`).

Para desinstalar, `mitarasca uninstall`: quita el comando del
PATH, no borra datos y te muestra dónde quedaron, con el `rm -rf` para borrarlos.

Próximamente: paquete en npm. macOS y Windows todavía no tienen instalador.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Modo desarrollo

Desde la carpeta donde clonaste el repo, con `bun install` hecho. Elegir una de las dos
bases; `dev:demo` y `dev` quedan corriendo en esa terminal.

Sobre la demo:

```bash
bun run db:seed:demo      # genera ./data/demo.db con datos inventados
bun run dev:demo          # API (http://localhost:3787) y web (http://localhost:5173) sobre la demo
```

Sobre tu base:

```bash
bun run db:init           # crea ./data/mitarasca.db vacía (migraciones y tags base)
bun run dev               # API y web sobre tu base
```

Con algunas versiones de Bun `bun run dev` solo arranca la API; en ese caso, usar dos
terminales con `bun run dev:api` y `bun run dev:web`.

En otra terminal, desde la misma carpeta:

```bash
# CLI desde el repo, sin instalar
bun packages/cli/src/index.ts --help

# Typecheck, lint y tests
bun run typecheck
bun run lint
(cd packages/core && bun test)
```

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Docker

La imagen trae la web y la API, sin la CLI. Los datos van en `./data-docker/` (nunca en
`./data/`). Crear la carpeta con tu usuario antes del primer uso: si la crea Docker queda de
root y la imagen corre como uid 1000. Los comandos van desde la carpeta del repo (la de
instalación o donde lo clonaste), que tiene el `docker-compose.yml`. Elegir una base;
`docker compose up` queda corriendo en esa terminal.

Base vacía:

```bash
mkdir -p data-docker
docker compose run --rm api bun packages/core/scripts/init-db.ts
docker compose up --build
```

Demo:

```bash
mkdir -p data-docker
docker compose run --rm api bun packages/core/scripts/seed-demo.ts
MITARASCA_DEMO=1 docker compose up --build
```

La web queda en http://localhost:3787.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## MCP

`mitarasca mcp` levanta el servidor MCP por stdio (18 tools; 10 escriben). Se configura a
mano en el cliente. Con Claude Code:

```bash
claude mcp add -s user mitarasca -- mitarasca mcp --demo   # todos tus proyectos, sobre la demo
claude mcp add -s project mitarasca -- mitarasca mcp       # solo este proyecto (.mcp.json), tu base
```

Claude Desktop, otros clientes y las limitaciones en la [guía del MCP](./docs/guias/mcp.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Configuración avanzada

La base se elige con `DB_PATH`, `--demo`, el `db_path` de la config o, si no hay nada de eso,
`data/mitarasca.db` dentro de la carpeta del repo (con el instalador por `curl`,
`~/.local/share/mitarasca/data/mitarasca.db`). El orden completo está en
[Arquitectura](./docs/architecture.md), sección "Configuración y datos locales".

Solo `mitarasca init` y `mitarasca demo` (y sus equivalentes `bun run db:init` y
`bun run db:seed:demo`) crean la base; el instalador corre `mitarasca init`. El resto de los
comandos, la API y el MCP avisan qué correr si no existe.

```bash
mitarasca config set db_path /ruta/absoluta/a/mitarasca.db   # config global
mitarasca config path                                         # qué archivos lee
mitarasca ui --port 4000                                      # otro puerto (la API sola usa API_PORT)
```

`MITARASCA_DEBUG=1` muestra el stack completo de los errores de la CLI.

Otras guías:

- [CLI](./docs/guias/cli.md)
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

La lógica vive solo en `core`; los demás paquetes traducen su entrada a las
funciones del dominio. Más detalle en [`docs/architecture.md`](./docs/architecture.md).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Estado del proyecto

Proyecto personal, publicado para portfolio. La web y la API son la forma
principal de uso. El CLI y el MCP cubren lectura y escritura de movimientos y deudas, con
algunas partes experimentales. La importación desde capturas está ajustada a un caso de uso
propio. El estado de cada parte está en [`docs/features.md`](./docs/features.md).

Se instala con `scripts/install.sh` (solo Linux), clonando el repo o con `curl`. Todavía no
hay paquete publicado en npm.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Contribuir

Es un proyecto personal, pero los issues y las contribuciones son bienvenidos para aprender e intercambiar ideas.

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

## Licencia

Distribuido bajo la licencia MIT. Ver [`LICENSE`](./LICENSE).

<p align="right">(<a href="#readme-top">volver arriba</a>)</p>

[ci-shield]: https://github.com/lucianodlf/mitarasca/actions/workflows/ci.yml/badge.svg
[ci-url]: https://github.com/lucianodlf/mitarasca/actions/workflows/ci.yml
[license-shield]: https://img.shields.io/badge/license-MIT-blue.svg
[license-url]: ./LICENSE
