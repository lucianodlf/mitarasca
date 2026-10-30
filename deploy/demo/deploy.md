# Deploy de demo pública — guía

Demo en `https://mitarasca.demo.lucianodlf.com.ar`, VPS Oracle `VM.Standard.E2.1.Micro` (1GB,
Always Free, Ubuntu). Deploy al estilo producción: la imagen se construye en GitLab CI, se publica
en el Container Registry del proyecto y el VPS solo hace `docker compose pull`/`up`. El VPS no
tiene clone del repo, ni Bun, ni compila nada.

```
git tag vX.Y.Z ─► GitLab CI: test ─► build_image ─► release ─► deploy_demo ─(manual)─► reseed_demo
                               │                       │            │
                               ▼                       ▼            ▼  ssh
          registry.example.com/example/mitarasca:vX.Y.Z   GitLab Release   VPS: docker compose up
                                                                              Caddy :443 ─► 127.0.0.1:3787
```

| Pieza | Archivo | Dónde vive en el VPS |
|---|---|---|
| Imagen (API + SPA + seed + migraciones) | `Dockerfile`, `.dockerignore` | registry |
| Pipeline | `.gitlab-ci.yml` | — |
| Compose de la demo | `deploy/demo/docker-compose.yml` | `/srv/example-demo/docker-compose.yml` (lo copia cada deploy) |
| Variables de la app + `IMAGE_TAG` | — (nunca en el repo) | `/srv/example-demo/.env` |
| Datos | `packages/core/scripts/seed-demo.ts` (en la imagen) | `/srv/example-demo/data/demo.db` |
| Sitio de Caddy | `deploy/demo/mitarasca.caddy` | `/etc/caddy/sites/mitarasca.caddy` (vía `import`) |
| Operación desde local | `Makefile` (`demo-*`) | — |

La DB nunca va en la imagen ni en el repo: es un volumen generado por el seed con datos
inventados. El seed solo escribe archivos `*demo*.db` y rechaza `mitarasca.db` (también vía
symlink), así que no puede pisar la DB real.

## Flujo diario

```bash
git push origin <rama>        # solo test
git push origin main          # test + build (imagen :<sha>); no despliega
git tag v0.2.0 && git push origin v0.2.0
#   -> test, build (imagen :v0.2.0 y :latest), GitLab Release, deploy_demo
```

- Refrescar los datos de la demo: en el pipeline del tag, ejecutar el job manual `reseed_demo`
  (o `make demo-reseed` desde local). Hacerlo también cuando el release trae migraciones nuevas
  (`packages/core/drizzle/`): el seed regenera `demo.db` desde cero con el esquema de la imagen.
- Rollback: re-ejecutar `deploy_demo` del pipeline de un tag anterior (Deployments >
  Environments > demo > Re-deploy), o en el VPS:
  `sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=v0.1.0/' .env && docker compose up -d --wait`.
- Estado: `make demo-status` (tag desplegado, contenedor y `/health`).

## Puesta en marcha (una vez)

### 1. VPS, DNS y TLS

1. VPS Oracle `VM.Standard.E2.1.Micro`. Security List de la VCN con 80/443 abiertos (Oracle
   bloquea todo salvo SSH por defecto).
2. DNS en Cloudflare: registro A `mitarasca.demo.lucianodlf.com.ar` → IP del VPS.
3. TLS, una de dos:
   - Let's Encrypt automático de Caddy (actual): DNS en **nube gris**, sin directiva `tls` en
     `mitarasca.caddy`. Ver "TLS con Let's Encrypt" más abajo.
   - Origin Certificate de Cloudflare: nube naranja, descomentar la línea `tls` de
     `mitarasca.caddy` y copiar `.pem`/`.key` (nunca al repo) a `/etc/caddy/certs/` con owner
     `caddy:caddy` y `600` en el `.key` (Caddy corre como usuario `caddy`, no root).

### 2. Docker y Caddy en el VPS

```bash
# en el VPS, con el repo a mano (o copiando deploy/install-host.sh)
./deploy/install-host.sh --docker --caddy
sudo usermod -aG docker "$USER"    # re-loguear después
docker compose version
```

En Debian/Ubuntu el paquete de Caddy deja `caddy.service` corriendo al instalarse.

### 3. Acceso del VPS al registry (deploy token)

El proyecto es privado: el VPS necesita credenciales de solo lectura del registry.

1. GitLab > proyecto > Settings > Repository > Deploy tokens > Add token: nombre
   `vps-demo-registry`, scope **solo `read_registry`**.
2. En el VPS (pide el token por stdin, no queda en el historial):

```bash
docker login registry.gitlab.com -u <usuario-del-deploy-token>
```

### 4. Acceso del pipeline al VPS (SSH)

Clave dedicada al pipeline, no la personal:

```bash
# en local
ssh-keygen -t ed25519 -N "" -C "gitlab-ci-mitarasca-demo" -f ~/.ssh/mitarasca_demo_ci
ssh-copy-id -i ~/.ssh/mitarasca_demo_ci.pub example-user@<ip-vps>
ssh-keyscan -t ed25519 <ip-vps>     # salida = valor de SSH_KNOWN_HOSTS
```

GitLab > Settings > CI/CD > Variables (todas **Protected**; las de tipo File con salto de línea
final):

| Key | Tipo | Valor |
|---|---|---|
| `SSH_PRIVATE_KEY` | File | contenido de `~/.ssh/mitarasca_demo_ci` |
| `SSH_KNOWN_HOSTS` | File | salida de `ssh-keyscan` |
| `VPS_HOST` | Variable | IP del VPS |
| `VPS_USER` | Variable | `example-user` |

Las variables protegidas solo llegan a ramas/tags protegidos: Settings > Repository > Protected
tags > `v*`.

### 5. Carpeta de la demo, compose y Caddy

Desde local (usa `VPS_USER`/`VPS_HOST` de `.env.demo`):

```bash
make demo-bootstrap
```

Crea `/srv/example-demo/data` (owner uid 1000, el usuario `bun` de la imagen), copia el
compose, instala `/etc/caddy/sites/mitarasca.caddy` y agrega `import /etc/caddy/sites/*.caddy`
al `/etc/caddy/Caddyfile` del VPS **sin tocar los demás sitios** (p. ej. poliedrica). Si ese
Caddyfile todavía tiene un bloque `mitarasca.demo...` propio, borrarlo a mano antes: Caddy
rechaza el sitio duplicado (`caddy validate` corta el target antes del reload).

Crear `/srv/example-demo/.env` en el VPS (nunca en el repo):

```bash
cat > /srv/example-demo/.env <<'EOF'
IMAGE_TAG=v0.1.0
APP_ENV=demo
API_PORT=3787
CORS_ORIGIN=https://mitarasca.demo.lucianodlf.com.ar
EOF
```

### 6. Primer release y datos

```bash
git tag v0.1.0 && git push origin v0.1.0     # deploy_demo levanta el contenedor
```

Luego ejecutar `reseed_demo` en ese pipeline (o `make demo-reseed`) para generar `demo.db`.

## Verificación

```bash
make demo-status                                                   # IMAGE_TAG, contenedor healthy, {"status":"ok"}
curl -s https://mitarasca.demo.lucianodlf.com.ar/health            # {"status":"ok"}
curl -sI https://mitarasca.demo.lucianodlf.com.ar/                 # 200, text/html
```

Navegar la SPA (Dashboard, Egresos, Balance, Deudas): datos cargados, requests `/trpc/*` en 200
y consola sin errores. En el VPS, `ls /srv/example-demo/data/` debe mostrar solo `demo.db`.

## Probar la imagen en local

```bash
docker compose run --rm api bun run packages/core/scripts/seed-demo.ts /app/data/demo.db
docker compose up --build        # http://localhost:3787 ; monta data-docker/, nunca data/
```

## Problemas conocidos

### `Failed to execute 'json' on 'Response': Unexpected end of JSON input` en la SPA

La API no responde: Caddy devuelve 502 sin cuerpo en `/trpc/*` y el cliente tRPC falla al
parsear. Caso visto (2026-10-28, deploy anterior con systemd): el servicio quedó `inactive` y
`disabled` tras un reinicio de la VM. Con compose, `restart: unless-stopped` lo relanza al
arrancar Docker. Diagnóstico:

```bash
make demo-status
ssh example-user@<ip-vps> 'cd /srv/example-demo && docker compose logs --tail 50 api'
```

### `docker compose pull` falla con `unauthorized` / `denied`

Falta el `docker login registry.gitlab.com` del paso 3 en el VPS, o el deploy token expiró o no
tiene `read_registry`.

### `deploy_demo` falla con `Permission denied (publickey)` o `Host key verification failed`

Variables `SSH_PRIVATE_KEY`/`SSH_KNOWN_HOSTS` mal cargadas (falta el salto de línea final del
valor tipo File) o el tag no es protegido y el job no recibe las variables protegidas.

### `SQLiteError: unable to open database file` en el contenedor

`/srv/example-demo/data` no es escribible por uid 1000 (usuario `bun` de la imagen; en OCI el
usuario `example-user` es uid 1001). `sudo chown 1000:1000 /srv/example-demo/data`.

### TLS con Let's Encrypt en vez de Origin Certificate de Cloudflare

Si el subdominio anidado (`mitarasca.demo.lucianodlf.com.ar`) no está cubierto por el plan de
Cloudflare, usar el ACME automático de Caddy:

1. DNS en **nube gris** (DNS-only): Let's Encrypt valida directo contra el VPS.
2. 80/443 abiertos en la Security List de OCI.
3. Sin directiva `tls` en `deploy/demo/mitarasca.caddy` (está comentada).
4. `sudo systemctl reload caddy` y `journalctl -u caddy -f`: buscar
   `"certificate obtained successfully"`.

`dig +short mitarasca.demo.lucianodlf.com.ar @1.1.1.1` desde el VPS debe devolver la IP del VPS,
no un rango de Cloudflare.

### 502 intermitente con `lookup health on 127.0.0.53:53` (histórico)

Pasó con `reverse_proxy /trpc/* /health localhost:3787`: Caddy toma el segundo path como
upstream. Hoy `mitarasca.caddy` usa un único `reverse_proxy localhost:3787` sin matchers.

## Deploy anterior (sin Docker)

Hasta 2026-10 la demo corría desde un clone en `/srv/example-app` con `bun` bajo systemd
(`mitarasca-api.service`) y el build de `web` subido por rsync. Los archivos de ese flujo
(`packages/api/mitarasca-api.service.template`, `deploy/demo/sync-web.sh`, targets
`deploy`/`setup-systemd` del `Makefile`) se borraron; están en el historial de git anterior al
ítem [053]. `docs/deploy/vps-low-memory-build.md` queda como referencia del problema de memoria
que motivó compilar fuera del VPS.
