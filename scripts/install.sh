#!/usr/bin/env sh
# Instalador de mitarasca: `curl -fsSL <url>/install.sh | sh`.
# Asegura Bun instalado y delega en `bun install -g @lucianodlf/mitarasca`.
#
# Mientras el paquete no esté publicado en el registry público de npm, este
# script acepta config de registry privado vía MITARASCA_REGISTRY_URL /
# MITARASCA_REGISTRY_TOKEN. El día que se publique a npmjs.org, correrlo sin
# esas variables funciona igual (usa el registry default de Bun).
set -eu

PACKAGE="@lucianodlf/mitarasca"

echo "Detectado: $(uname -s) $(uname -m)"

if ! command -v bun >/dev/null 2>&1; then
  echo "Bun no está instalado, instalando…"
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
fi

if [ -n "${MITARASCA_REGISTRY_URL:-}" ] && [ -n "${MITARASCA_REGISTRY_TOKEN:-}" ]; then
  BUNFIG="$HOME/.bunfig.toml"
  SCOPE_LINE="\"@lucianodlf\" = { url = \"${MITARASCA_REGISTRY_URL}\", token = \"${MITARASCA_REGISTRY_TOKEN}\" }"
  if [ -f "$BUNFIG" ] && grep -q '"@lucianodlf"' "$BUNFIG" 2>/dev/null; then
    echo "Scope @lucianodlf ya configurado en $BUNFIG, no se toca."
  elif [ -f "$BUNFIG" ] && grep -q '\[install.scopes\]' "$BUNFIG" 2>/dev/null; then
    echo "Ya existe [install.scopes] en $BUNFIG con otro contenido." >&2
    echo "Agregá manualmente esta línea debajo de [install.scopes]:" >&2
    echo "  $SCOPE_LINE" >&2
    exit 1
  else
    printf '\n[install.scopes]\n%s\n' "$SCOPE_LINE" >> "$BUNFIG"
    echo "Config de registry agregada a $BUNFIG"
  fi
fi

echo "Instalando ${PACKAGE}…"
bun install -g "$PACKAGE"

BIN_DIR="$(bun pm bin -g)"
echo ""
echo "Instalado. Binario en: ${BIN_DIR}/mitarasca"
echo "Confirmá con: mitarasca --help"
