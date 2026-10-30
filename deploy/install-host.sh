#!/usr/bin/env bash
# Prepara el host (Ubuntu/Debian/Oracle Linux, x86/arm) para el deploy: git, vim, tmux + conf
# siempre; Docker, Bun y Caddy son opcionales (flag o pregunta interactiva); apertura de 80/443
# en el firewall también es opcional (flag o pregunta interactiva). Idempotente.
set -euo pipefail

INSTALL_DOCKER=""
INSTALL_BUN=""
INSTALL_CADDY=""
ADD_WEB_PORTS=""

for arg in "$@"; do
  case "$arg" in
    --docker) INSTALL_DOCKER=yes ;;
    --bun) INSTALL_BUN=yes ;;
    --caddy) INSTALL_CADDY=yes ;;
    --add-web-ports) ADD_WEB_PORTS=yes ;;
    *) echo "Flag desconocida: $arg" >&2; exit 1 ;;
  esac
done

ask_yes_no() {
  local prompt="$1" reply
  read -r -p "$prompt [y/N] " reply </dev/tty
  [[ "$reply" =~ ^[Yy]$ ]]
}

if [ -z "$INSTALL_DOCKER" ]; then
  ask_yes_no "¿Instalar Docker?" && INSTALL_DOCKER=yes || INSTALL_DOCKER=no
fi

if [ -z "$INSTALL_BUN" ]; then
  ask_yes_no "¿Instalar Bun?" && INSTALL_BUN=yes || INSTALL_BUN=no
fi

if [ -z "$INSTALL_CADDY" ]; then
  ask_yes_no "¿Instalar Caddy?" && INSTALL_CADDY=yes || INSTALL_CADDY=no
fi

if [ -z "$ADD_WEB_PORTS" ]; then
  ask_yes_no "¿Abrir puertos 80/443 en el firewall?" && ADD_WEB_PORTS=yes || ADD_WEB_PORTS=no
fi

# --- Docker ---
if [ "$INSTALL_DOCKER" = yes ]; then
  if command -v docker &>/dev/null; then
    echo "Docker ya instalado: $(docker --version)"
  else
    echo "Instalando Docker..."
    if [ -f /etc/os-release ] && grep -qi "ubuntu\|debian" /etc/os-release; then
      curl -fsSL https://get.docker.com | sh
    elif [ -f /etc/os-release ] && grep -qi "ol\|oracle\|rhel\|centos" /etc/os-release; then
      sudo dnf install -y dnf-utils
      sudo dnf config-manager --add-repo https://download.docker.com/linux/centos/docker-ce.repo
      sudo dnf install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
      sudo systemctl enable --now docker
    else
      echo "Distro no reconocida, instalar Docker manualmente: https://docs.docker.com/engine/install/" >&2
      exit 1
    fi
  fi

  if ! groups "$USER" | grep -q docker; then
    sudo usermod -aG docker "$USER"
    echo "Usuario agregado al grupo docker. Cerrar sesión y volver a entrar (o 'newgrp docker') para que tome efecto."
  fi

  # 2026-07-13: run-deploy-demo — en algunas VMs cloud (visto en OCI) el daemon Docker hereda
  # como DNS la IP del metadata service (169.254.169.254), inalcanzable desde la red bridge de
  # Docker: rompe apt-get/pip/pnpm dentro del build con "Temporary failure resolving". Forzar
  # DNS público explícito evita depender del resolv.conf del host.
  if [ ! -f /etc/docker/daemon.json ] || ! grep -q '"dns"' /etc/docker/daemon.json; then
    echo "Configurando DNS público para Docker (/etc/docker/daemon.json)..."
    echo '{ "dns": ["8.8.8.8", "1.1.1.1"] }' | sudo tee /etc/docker/daemon.json >/dev/null
    sudo systemctl restart docker
  else
    echo "DNS de Docker ya configurado en /etc/docker/daemon.json, no se modifica."
  fi
else
  echo "Docker: omitido."
fi

# --- Bun ---
if [ "$INSTALL_BUN" = yes ]; then
  command -v unzip &>/dev/null || { echo "Instalando unzip..."; sudo apt-get update && sudo apt-get install -y unzip; }

  if command -v bun &>/dev/null; then
    echo "Bun ya instalado: $(bun --version)"
  else
    echo "Instalando Bun..."
    curl -fsSL https://bun.sh/install | bash
    echo "Agregar Bun al PATH de esta shell (o abrir una nueva) antes de continuar:"
    echo '  export PATH="$HOME/.bun/bin:$PATH"'
  fi
else
  echo "Bun: omitido."
fi

# --- Caddy ---
if [ "$INSTALL_CADDY" = yes ]; then
  if command -v caddy &>/dev/null; then
    echo "Caddy ya instalado: $(caddy version)"
  else
    echo "Instalando Caddy..."
    if [ -f /etc/os-release ] && grep -qi "ubuntu\|debian" /etc/os-release; then
      sudo apt install --yes debian-keyring debian-archive-keyring apt-transport-https curl
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
      sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
      sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
      sudo apt update
      sudo apt install -y caddy
    elif [ -f /etc/os-release ] && grep -qi "ol\|oracle\|rhel\|centos" /etc/os-release; then
      curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/rpm.repo' | sudo tee /etc/yum.repos.d/caddy-stable.repo
      sudo dnf install -y caddy
    else
      echo "Distro no reconocida, instalar Caddy manualmente: https://caddyserver.com/docs/install" >&2
      exit 1
    fi
    caddy version
  fi
else
  echo "Caddy: omitido."
fi

# --- git, vim, tmux ---
command -v git &>/dev/null || { echo "Instalando git..."; sudo apt-get install -y git 2>/dev/null || sudo dnf install -y git; }
command -v vim &>/dev/null || { echo "Instalando vim..."; sudo apt-get install -y vim 2>/dev/null || sudo dnf install -y vim; }
command -v tmux &>/dev/null || { echo "Instalando tmux..."; sudo apt-get install -y tmux 2>/dev/null || sudo dnf install -y tmux; }
command -v make &>/dev/null || { echo "Instalando make..."; sudo apt-get install -y make 2>/dev/null || sudo dnf install -y make; }

# 2026-07-18: run-deploy-demo — bajar el .tmux.conf de dotfiles pero mantener el prefijo nativo
# C-b (cambiarlo a C-a rompe la costumbre en la VM remota), así que se comenta ese bloque.
TMUX_CONF="$HOME/.tmux.conf"
curl -fsSL https://raw.githubusercontent.com/lucianodlf/dotfiles/refs/heads/main/tmux/.tmux.conf -o "$TMUX_CONF"
sed -i \
  -e "s/^# Cambiar el prefijo de 'C-b' a 'C-a'/#&/" \
  -e "s/^set-option -g prefix C-a/#&/" \
  -e "s/^unbind C-b/#&/" \
  -e "s/^bind-key C-a send-prefix/#&/" \
  -e "s/^bind-key a send-prefix/#&/" \
  "$TMUX_CONF"

# --- Puertos 80/443 ---
if [ "$ADD_WEB_PORTS" = yes ]; then
  if command -v ufw &>/dev/null; then
    for port in 80 443; do
      if sudo ufw status | grep -qE "^${port}/tcp\s+ALLOW"; then
        echo "ufw: $port/tcp ya permitido, no se modifica."
      else
        sudo ufw allow "${port}/tcp"
        echo "ufw: $port/tcp permitido."
      fi
    done
  elif command -v firewall-cmd &>/dev/null; then
    for port in 80 443; do
      if sudo firewall-cmd --list-ports | grep -q "${port}/tcp"; then
        echo "firewall-cmd: $port/tcp ya permitido, no se modifica."
      else
        sudo firewall-cmd --permanent --add-port="${port}/tcp"
        echo "firewall-cmd: $port/tcp permitido (permanent)."
      fi
    done
    sudo firewall-cmd --reload
  elif command -v iptables &>/dev/null; then
    for port in 80 443; do
      if sudo iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null; then
        echo "iptables: $port/tcp ya permitido, no se modifica."
      else
        sudo iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
        echo "iptables: $port/tcp permitido."
      fi
    done
  else
    echo "No se encontró ufw, firewall-cmd ni iptables. Abrir 80/443 manualmente." >&2
  fi

  # 2026-07-13: run-deploy-demo — las reglas runtime de iptables no sobreviven un reboot en
  # imágenes cloud (Ubuntu/OCI): la persistencia vive en /etc/iptables/rules.v4, generada por el
  # cloud-init de la imagen base y que normalmente no incluye 80/443. Solo advierte, no la edita.
  RULES_V4=/etc/iptables/rules.v4
  if [ -f "$RULES_V4" ]; then
    for port in 80 443; do
      if ! grep -q -- "--dport $port -j ACCEPT" "$RULES_V4"; then
        echo "Warning: puede faltar config de $RULES_V4: -A INPUT -p tcp -m state --state NEW -m tcp --dport $port -j ACCEPT"
      fi
    done
  fi
else
  echo "Puertos 80/443: omitido."
fi

echo ""
echo "Host listo. IMPORTANTE: si esto corre en OCI, también hay que abrir 80/443 en la Security List/NSG desde la consola de OCI."
