# Build de `packages/web` en VPS de memoria reducida (1GB o menos)

> Histórico: desde [053] la demo se compila en GitLab CI y el VPS solo baja la imagen
> (`deploy/demo/deploy.md`). `deploy/demo/sync-web.sh` ya no existe; el swap sigue siendo útil.

Caso de borde: el shape `VM.Standard.E2.1.Micro` de Oracle Cloud (Always Free) tiene 1GB de
RAM. `bun run --cwd packages/web build` (Vite 6 + Rollup + Tailwind v4/Lightning CSS + `vue-tsc`)
puede saturar esa memoria durante el bundling/minify y colgar la VM sin llegar a terminar el
build — visible en el panel de OCI como consumo de memoria al 100% seguido de la VM sin
responder, forzando un reset manual.

Este documento cubre dos estrategias, no mutuamente excluyentes:

1. **Swap en el VPS**: red de seguridad general (además del build, ayuda con cualquier proceso
   que pueda picar memoria — `bun install`, la propia API bajo carga, etc.).
2. **Build local + sync del `dist/`**: evita el problema de raíz para el build de `web`
   específicamente, ya que nunca se ejecuta en el VPS.

Sirven en conjunto: swap como colchón general, build local como la forma recomendada de generar
`packages/web/dist` en hardware con poca RAM.

## 1. Agregar swap al VPS

Oracle Cloud Free Tier no provisiona swap por defecto. Crear un swapfile de 2-4GB:

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
free -h   # confirmar que aparece la línea Swap con el tamaño creado
```

Persistir entre reinicios (`/etc/fstab`):

```bash
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

Notas:

- El boot volume del Always Free tier es limitado (revisar espacio libre con `df -h` antes de
  `fallocate` — no crear un swapfile más grande que el margen disponible).
- Swap es más lento que RAM; ayuda a que el proceso no sea OOM-killed, pero un build que ya
  demora mucho puede demorar bastante más. No sustituye evitar el build en el VPS (sección 2)
  para `packages/web` si el objetivo es velocidad, solo evita el colgado total de la VM.
- `swapon --show` y `free -h` para verificar en cualquier momento que el swap sigue activo.

## 2. Build local + sync de `packages/web/dist`

En vez de correr `bun run --cwd packages/web build` en el VPS, compilar en una máquina con
recursos (la propia laptop de desarrollo) y subir solo el resultado (`packages/web/dist/`,
carpeta de archivos estáticos) por `rsync`. `deploy/demo/sync-web.sh` automatiza build + sync:

```bash
./deploy/demo/sync-web.sh
```

Sin argumentos, toma `VPS_USER`/`VPS_HOST`/`VPS_ROOT_DIR` de `.env.demo` (raíz del repo). Para
apuntar a otro destino sin tocar `.env.demo`, pasar `usuario@ip` como argumento:

```bash
./deploy/demo/sync-web.sh usuario@ip
```

El script usa `rsync --delete`, que asegura que archivos hasheados de builds anteriores
(`assets/*.js`, `*.css` con hash en el nombre de Vite) que ya no están en el build actual no
queden huérfanos en el VPS.

**En el VPS**, Caddy sirve `dist/` directo (`root * /srv/example-app/packages/web/dist` en
`deploy/demo/Caddyfile`) — no hace falta reiniciar ni recargar nada después del `rsync`, los
archivos estáticos se sirven inmediatamente.

Verificación:

```bash
ls -la /srv/example-app/packages/web/dist/   # confirmar index.html y assets/ actualizados
curl -sI https://mitarasca.demo.lucianodlf.com.ar/
```

Este flujo reemplaza únicamente el build de `web` (frontend estático). El resto de
`make deploy` (`git pull`, `bun install`, restart de `mitarasca-api`) sigue corriendo en el VPS
sin cambios — el paquete `api` no requiere bundling pesado tipo Rollup/Vite.
