#!/usr/bin/env bash
# Instalador de mitarasca para Linux. Dos formas:
#   ./scripts/install.sh                      (dentro de un clon: instala ese clon)
#   curl -fsSL https://raw.githubusercontent.com/lucianodlf/mitarasca/main/scripts/install.sh | bash
#                                             (clona en ~/.local/share/mitarasca)
# Volver a correrlo actualiza. No usa sudo: si falta algo del sistema, muestra el comando.
# Variables: MITARASCA_DIR (dónde clonar), MITARASCA_REPO (URL a clonar), MITARASCA_YES=1
# (instala Bun sin preguntar).
set -euo pipefail

REPO_URL="${MITARASCA_REPO:-https://github.com/lucianodlf/mitarasca.git}"
BIN_DIR="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }

# Comando sugerido para instalar paquetes del sistema según la distro.
pkg_hint() {
  if command -v apt-get >/dev/null 2>&1; then say "sudo apt-get install -y $*"
  elif command -v dnf >/dev/null 2>&1; then say "sudo dnf install -y $*"
  elif command -v pacman >/dev/null 2>&1; then say "sudo pacman -S --needed $*"
  else say "instalá con el gestor de paquetes de tu distro: $*"
  fi
}

need_pkg() {
  command -v "$1" >/dev/null 2>&1 && return 0
  say "Falta $1. Instalalo con:" >&2
  say "  $(pkg_hint "$1")" >&2
  exit 1
}

# Pregunta sí/no leyendo de /dev/tty (con curl | bash, stdin es el script).
confirm() {
  [ "${MITARASCA_YES:-}" = "1" ] && return 0
  local ans
  { exec 3</dev/tty; } 2>/dev/null || return 1
  printf '%s [s/N] ' "$1" >/dev/tty
  read -r ans <&3 || ans=""
  exec 3<&-
  [[ "$ans" =~ ^[sSyY] ]]
}

[ "$(uname -s)" = "Linux" ] || die "por ahora el instalador es solo para Linux."

# 1. ¿Clon local o curl | bash?
SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [ -n "$SCRIPT_PATH" ] && [ -f "$SCRIPT_PATH" ] \
  && [ -f "$(dirname "$SCRIPT_PATH")/../packages/cli/src/index.ts" ]; then
  DIR="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
  say "Instalando desde el clon: $DIR"
else
  need_pkg git
  DIR="${MITARASCA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mitarasca}"
  if [ -d "$DIR/.git" ]; then
    say "Actualizando $DIR"
    git -C "$DIR" pull --ff-only
  elif [ -e "$DIR" ] && [ -n "$(ls -A "$DIR" 2>/dev/null)" ]; then
    die "$DIR existe y no es un clon de mitarasca. Movelo o usá MITARASCA_DIR=<otra ruta>."
  else
    say "Clonando $REPO_URL en $DIR"
    mkdir -p "$(dirname "$DIR")"
    git clone --depth 1 "$REPO_URL" "$DIR"
  fi
fi

# 2. Bun
if ! command -v bun >/dev/null 2>&1 && [ -x "$HOME/.bun/bin/bun" ]; then
  export PATH="$HOME/.bun/bin:$PATH"
fi
if ! command -v bun >/dev/null 2>&1; then
  say "Falta Bun (https://bun.sh), el runtime de mitarasca."
  if confirm "¿Lo instalo ahora con el instalador oficial (curl -fsSL https://bun.sh/install | bash)?"; then
    need_pkg curl
    need_pkg unzip
    curl -fsSL https://bun.sh/install | bash
    export PATH="$HOME/.bun/bin:$PATH"
  else
    say "Instalalo con: curl -fsSL https://bun.sh/install | bash" >&2
    say "y volvé a correr este script." >&2
    exit 1
  fi
fi
say "Bun $(bun --version)"

# 3. Dependencias, build de la web y DB por defecto
cd "$DIR"
bun install --frozen-lockfile
bun run --cwd packages/web build
# Desde $HOME: resuelve la DB igual que cuando el usuario corra `mitarasca` después.
(cd "$HOME" && bun "$DIR/packages/cli/src/index.ts" init)

# 4. Comando global
mkdir -p "$BIN_DIR"
chmod +x "$DIR/packages/cli/src/index.ts"
ln -sf "$DIR/packages/cli/src/index.ts" "$BIN_DIR/mitarasca"
say ""
say "Listo: $BIN_DIR/mitarasca -> $DIR/packages/cli/src/index.ts"

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    say ""
    say "$BIN_DIR no está en tu PATH. Agregá esta línea a ~/.bashrc o ~/.zshrc:"
    say "  export PATH=\"\$HOME/.local/bin:\$PATH\""
    ;;
esac
if [ -x "$HOME/.bun/bin/bun" ] && ! command -v bun >/dev/null 2>&1; then
  say "Abrí una terminal nueva para que bun quede en el PATH."
fi

say ""
say "Próximos pasos:"
say "  mitarasca demo      # abre la web con datos de ejemplo"
say "  mitarasca ui        # abre la web con tu base (vacía al principio)"
say "  mitarasca --help    # todos los comandos (agregá --demo para usar la demo)"
