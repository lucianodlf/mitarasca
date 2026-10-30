#!/usr/bin/env bash
# Wrapper de testing, dev-only — NO es el instalador de producción (ver
# scripts/install.sh). Arma un $HOME temporal aislado y corre install.sh vía
# pipe (cat | sh, no source), igual que lo haría un usuario real con
# `curl | sh`, para probar el camino curl|sh contra un registry real
# (Verdaccio o GitLab) sin tocar el $HOME real de quien lo ejecuta.
#
# Uso:
#   MITARASCA_TEST_REGISTRY_URL=... MITARASCA_TEST_REGISTRY_TOKEN=... \
#     bash scripts/dev-test-install.sh
set -euo pipefail

: "${MITARASCA_TEST_REGISTRY_URL:?Falta MITARASCA_TEST_REGISTRY_URL}"
: "${MITARASCA_TEST_REGISTRY_TOKEN:?Falta MITARASCA_TEST_REGISTRY_TOKEN}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="$(mktemp -d /tmp/mitarasca-install-test-XXXXXX)"
mkdir -p "$TMP_ROOT/home"

echo "Probando install.sh en entorno aislado: $TMP_ROOT"

cat "$REPO_ROOT/scripts/install.sh" | env -i \
  HOME="$TMP_ROOT/home" \
  PATH="/usr/bin:/bin" \
  MITARASCA_REGISTRY_URL="$MITARASCA_TEST_REGISTRY_URL" \
  MITARASCA_REGISTRY_TOKEN="$MITARASCA_TEST_REGISTRY_TOKEN" \
  sh

echo ""
echo "Listo. Probá manualmente:"
echo "  $TMP_ROOT/home/.bun/bin/mitarasca --help"
