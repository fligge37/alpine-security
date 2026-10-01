# Build-Kontext ist das Repo-Root (Monorepo, apps/api hängt am pnpm-Workspace),
# nicht apps/api selbst - siehe deploy/docker-compose.yml (`build.context: ..`).
#
# apps/api hat zur Laufzeit keine Abhängigkeit zu packages/shared-types (dort
# nur als `import type` genutzt, von tsc beim Kompilieren entfernt) - trotzdem
# muss das Workspace-Paket beim `pnpm install` auflösbar sein, daher der volle
# Monorepo-Kontext statt nur apps/api.
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS build
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @alpine-security/api build
# `pnpm deploy` baut einen eigenständigen Ordner mit aufgelösten Prod-Dependencies
# (kein Symlink-Node-Modules-Gefrickel im Monorepo) - der offizielle pnpm-Weg,
# ein einzelnes Workspace-Paket für ein schlankes Docker-Image zu exportieren.
RUN pnpm --filter @alpine-security/api deploy --prod /out

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /out .
EXPOSE 3000
CMD ["node", "dist/index.js"]
