FROM node:20-slim AS base
# --only-upgrade sur libgnutls30 (CVE-2026-33845, CVE-2026-42010) — cf.
# apps/api/Dockerfile pour la justification complète. apps/web n'avait
# jusqu'ici aucun apt-get dans ce stage (aucun paquet applicatif requis),
# ajouté ici uniquement pour ce correctif de sécurité.
RUN apt-get update -y && apt-get install --only-upgrade -y libgnutls30 && rm -rf /var/lib/apt/lists/*
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
COPY packages/ui/package.json packages/ui/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# --filter @pgd/web... (suffixe) — même correctif que apps/api/Dockerfile.
# @pgd/contracts était bien construit par l'ancienne commande (dépendance
# directe), mais @pgd/ui (design system, dépendance directe elle aussi) ne
# l'était pas.
RUN pnpm --filter @pgd/web... build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system pgd && useradd --system --gid pgd pgd
# tar bundlé par npm (CVE-2026-59873) — cf. apps/api/Dockerfile. npm jamais
# invoqué au runtime ici non plus (CMD lance next via node_modules/.bin
# directement, jamais `npm run`/`npm start`).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /repo /repo
USER pgd
WORKDIR /repo/apps/web
EXPOSE 3001
CMD ["node_modules/.bin/next", "start", "-p", "3001"]
