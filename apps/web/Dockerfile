FROM node:24-slim AS base
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
# NEXT_PUBLIC_API_URL — DOIT être fourni ICI, au build, jamais seulement au
# lancement du conteneur. Next.js inline chaque variable NEXT_PUBLIC_* dans
# le bundle CLIENT au moment de `next build` (apps/web/lib/api.ts:116,
# process.env.NEXT_PUBLIC_API_URL) ; passé ce stage, la valeur est figée dans
# les fichiers statiques produits — un `environment:`/`--env-file` au
# lancement du conteneur (docker-compose.prod.yml, .env.prod.example) n'a
# PLUS AUCUN EFFET, l'image tourne déjà avec le bundle déjà compilé. Sans cet
# ARG, le build retombe silencieusement sur le défaut codé en dur
# ("http://localhost:3000"), cassant tout déploiement derrière une URL
# publique différente — trouvé en construisant docker-compose.prod.yml
# (CLAUDE.md, chantier prod). À transmettre via
# `docker build --build-arg NEXT_PUBLIC_API_URL=https://... -f apps/web/Dockerfile .`
# dans le pipeline qui construit et pousse l'image vers le registre — pas
# une variable à renseigner dans .env.prod.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
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
# node -e plutôt que curl/wget — même raisonnement que apps/api/Dockerfile.
# apps/web n'a pas de route /health dédiée : /login est la seule route
# statique publique connue à répondre 200 sans session (vérifié en direct,
# migration Node 24 — cf. CLAUDE.md), utilisée ici faute d'alternative.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3001/login',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
CMD ["node_modules/.bin/next", "start", "-p", "3001"]
