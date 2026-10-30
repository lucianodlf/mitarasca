.PHONY: install-host demo-bootstrap demo-reseed demo-status public-sync

# Targets demo-*: se corren EN LOCAL y operan el VPS por SSH. Toman VPS_USER/VPS_HOST de
# .env.demo (ver .env.example). El deploy normal lo hace el pipeline (.gitlab-ci.yml).
DEMO_DIR ?= /srv/example-demo
VPS = set -a; . ./.env.demo; set +a; ssh "$$VPS_USER@$$VPS_HOST"
SCP = set -a; . ./.env.demo; set +a; scp

install-host:
	./deploy/install-host.sh

# Una vez por VPS (idempotente): carpeta de la demo, compose y sitio de Caddy vía import.
# No toca otros sitios del Caddyfile del VPS.
demo-bootstrap:
	$(VPS) 'mkdir -p $(DEMO_DIR)/data && sudo chown 1000:1000 $(DEMO_DIR)/data && sudo mkdir -p /etc/caddy/sites'
	$(SCP) deploy/demo/docker-compose.yml "$$VPS_USER@$$VPS_HOST:$(DEMO_DIR)/docker-compose.yml"
	$(SCP) deploy/demo/mitarasca.caddy "$$VPS_USER@$$VPS_HOST:/tmp/mitarasca.caddy"
	$(VPS) 'sudo mv /tmp/mitarasca.caddy /etc/caddy/sites/mitarasca.caddy \
		&& (grep -q "^import /etc/caddy/sites/\*.caddy" /etc/caddy/Caddyfile \
			|| echo "import /etc/caddy/sites/*.caddy" | sudo tee -a /etc/caddy/Caddyfile >/dev/null) \
		&& sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile \
		&& sudo systemctl reload caddy'

# Regenera data/demo.db con el seed de la imagen desplegada (mismo que el job reseed_demo).
demo-reseed:
	$(VPS) 'cd $(DEMO_DIR) && docker compose stop api \
		&& docker compose run --rm api bun run packages/core/scripts/seed-demo.ts /app/data/demo.db \
		&& docker compose up -d --wait'

demo-status:
	$(VPS) 'cd $(DEMO_DIR) && grep ^IMAGE_TAG= .env; docker compose ps; curl -s localhost:3787/health'

# Export al clon local del repo público (ver scripts/public-sync.ts). Hace commit, no pushea.
# Uso: make public-sync DEST=../mitarasca-public VERSION=X.Y.Z [MANIFEST=public-manifest] [REPLACEMENTS=public-replacements]
MANIFEST ?= public-manifest
REPLACEMENTS ?= public-replacements
public-sync:
	@test -n "$(DEST)" -a -n "$(VERSION)" || { echo "Uso: make public-sync DEST=<dir> VERSION=X.Y.Z [MANIFEST=<archivo>] [REPLACEMENTS=<archivo>]"; exit 1; }
	bun scripts/public-sync.ts --manifest "$(MANIFEST)" --dest "$(DEST)" --version "$(VERSION)" --replacements "$(REPLACEMENTS)"
