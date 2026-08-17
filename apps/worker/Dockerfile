FROM node:24-slim AS base
# procps fournit `ps`, requis par `nest start --watch` en dev (même raison
# que apps/api/Dockerfile) pour éviter un crash à chaque redémarrage à chaud.
# --only-upgrade sur libgnutls30 (CVE-2026-33845, CVE-2026-42010) — cf.
# apps/api/Dockerfile pour la justification complète.
RUN apt-get update -y && apt-get install -y openssl procps && apt-get install --only-upgrade -y libgnutls30 && rm -rf /var/lib/apt/lists/*
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
# --filter @pgd/worker... (suffixe) — même correctif que apps/api/Dockerfile,
# même bug (l'ancienne commande ne construisait ni @pgd/database ni
# @pgd/config ni @pgd/messaging, dont @pgd/worker dépend tous les trois).
RUN pnpm --filter @pgd/worker... build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system pgd && useradd --system --gid pgd pgd
# tar bundlé par npm (CVE-2026-59873) — cf. apps/api/Dockerfile. npm jamais
# invoqué au runtime ici non plus (CMD lance `node` directement).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /repo /repo
USER pgd
WORKDIR /repo/apps/worker
EXPOSE 3002
# node -e plutôt que curl/wget — même raisonnement que apps/api/Dockerfile.
# /health (liveness) plutôt que /health/ready : ready reflète l'état de la
# connexion RabbitMQ, pas celui du process worker lui-même.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3002/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node", "dist/main.js"]
