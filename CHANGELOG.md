# Changelog

Formato: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/). Versionado: [SemVer](https://semver.org/spec/v2.0.0.html) en 0.y.z. Las versiones anteriores a 0.2.0 están como tags de git.

## [Unreleased]

## [0.2.0] - 2026-11-03

### Añadido
- Instalación simple en Linux: `scripts/install.sh` (desde un clon o con `curl | bash`) deja el comando global `mitarasca`.
- Comandos `init`, `demo [--reseed]`, `mcp`, `web` (alias de `ui`) y `uninstall`.
- Modo demo con `--demo` o `MITARASCA_DEMO=1` para la CLI, la web, el MCP y Docker.
- Comandos `regla-invisible` y activar/desactivar reglas invisibles.
- Script de backfill de las etiquetas de deuda en los movimientos de cuota.
- Landing de producto y sitio de documentación.

### Cambiado
- Solo `mitarasca init` y `mitarasca demo` crean la base; el resto de los comandos, la API y el MCP avisan qué comando correr.
- Los errores de la CLI muestran solo el mensaje; `MITARASCA_DEBUG=1` muestra el stack completo.
- Docker ya no fija `DB_PATH`; crear antes la carpeta de datos con `mkdir -p data-docker`.
- Las cuotas heredan las etiquetas de la deuda al crear su movimiento.

[Unreleased]: https://github.com/lucianodlf/mitarasca/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/lucianodlf/mitarasca/compare/v0.1.1...v0.2.0
