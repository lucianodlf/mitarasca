# Imagen de la demo: API (Hono + tRPC) que además sirve el build de la SPA.
# Build: docker build -t mitarasca .   (contexto = raíz del repo; ver .dockerignore)
# La DB no va en la imagen: se monta en /app/data (ver deploy/demo/docker-compose.yml).

FROM oven/bun:1.3.14 AS deps
WORKDIR /app
COPY package.json bun.lock tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json packages/api/package.json
COPY packages/cli/package.json packages/cli/package.json
COPY packages/mcp/package.json packages/mcp/package.json
COPY packages/web/package.json packages/web/package.json
RUN bun install --frozen-lockfile

FROM deps AS web
COPY packages/core packages/core
COPY packages/api packages/api
COPY packages/web packages/web
RUN bun run --cwd packages/web build

# Solo dependencias de producción. Bun usa el linker aislado: cada workspace tiene su
# packages/<x>/node_modules con symlinks a node_modules/.bun, así que se copian ambos.
FROM deps AS prod-deps
RUN rm -rf node_modules packages/*/node_modules && bun install --frozen-lockfile --production
COPY packages/core packages/core
COPY packages/api packages/api

FROM oven/bun:1.3.14-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    API_PORT=3787 \
    DB_PATH=/app/data/demo.db \
    MITARASCA_WEB_DIST=/app/web-dist
COPY --from=prod-deps /app/node_modules node_modules
COPY --from=prod-deps /app/package.json /app/tsconfig.base.json ./
COPY --from=prod-deps /app/packages/core packages/core
COPY --from=prod-deps /app/packages/api packages/api
COPY --from=web /app/packages/web/dist web-dist
RUN mkdir -p /app/data && chown bun:bun /app/data
USER bun
EXPOSE 3787
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://localhost:3787/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["bun", "run", "packages/api/src/index.ts"]
