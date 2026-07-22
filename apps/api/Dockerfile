FROM node:20-slim AS base
# procps fournit `ps`, utilisé par `nest start --watch` (apps/api en dev, cf.
# docker-compose.override.yml) pour retrouver/tuer le process enfant à chaque
# redémarrage à chaud. Sans lui, tout changement de fichier détecté fait
# planter le conteneur (spawn ps ENOENT) au lieu de recompiler — constaté en
# Phase 4, probablement la cause des redémarrages « silencieux » observés
# depuis la Phase 2.
RUN apt-get update -y && apt-get install -y openssl procps && rm -rf /var/lib/apt/lists/*
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/messaging/package.json packages/messaging/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile
COPY packages/database/prisma packages/database/prisma
RUN pnpm --filter @pgd/database prisma:generate

FROM deps AS build
COPY . .
RUN pnpm --filter @pgd/contracts... --filter @pgd/api build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system pgd && useradd --system --gid pgd pgd
COPY --from=build /repo /repo
USER pgd
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
