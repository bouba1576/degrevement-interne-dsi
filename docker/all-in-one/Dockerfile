# docker/all-in-one/Dockerfile — image UNIQUE déployable (API + Worker + Web
# + Redis interne), demandée explicitement pour livrer un seul artefact
# `docker save` plutôt que la stack multi-conteneurs habituelle
# (docker-compose.prod.yml). PostgreSQL et RabbitMQ restent volontairement
# HORS de cette image : ce sont les deux services qui portent un état durable
# réel (données métier, audit 10 ans — règle non négociable 3 — et messages
# en file, R7/retry/DLX) ; les rebâtir à chaque recréation du conteneur
# applicatif effacerait cet état. Redis, lui, est bundlé — CLAUDE.md, règle
# non négociable 4 : « Redis est un reflet volatil intégralement
# reconstructible », aucune perte réelle à le loger dans le même conteneur
# que le code qui le consomme.
#
# Build :
#   docker build --build-arg NEXT_PUBLIC_API_URL=http://<hote-public>:3000 \
#     -f docker/all-in-one/Dockerfile -t pgd-app:latest .
# (NEXT_PUBLIC_API_URL inline dans le bundle CLIENT au build, jamais relu à
# l'exécution — même contrainte que apps/web/Dockerfile, cf. son commentaire
# pour la justification complète.)
#
# Run (PostgreSQL/RabbitMQ externes, cf. .env.aio.example) :
#   docker run -d --name pgd-app -p 3000:3000 -p 3001:3001 -p 3002:3002 \
#     --env-file .env.aio.example pgd-app:latest
#
# Export en un seul fichier tar :
#   docker save -o pgd-app.tar pgd-app:latest

FROM node:24-slim AS base
# Mêmes correctifs déjà appliqués et documentés dans apps/api|worker|web/
# Dockerfile (libgnutls30, CVE-2026-33845/42010 — cf. apps/api/Dockerfile
# pour la justification complète, non répétée ici). openssl : requis par
# Prisma (moteur de requêtes). procps : diagnostics (`ps`) utiles en
# conteneur multi-process. redis-server : Redis bundlé dans cette image,
# seul composant sans état durable réel (cf. ci-dessus). supervisor :
# superviseur de process — une seule image, trois process Node (api/worker/
# web) + Redis, à démarrer/redémarrer indépendamment les uns des autres.
RUN apt-get update -y \
  && apt-get install -y openssl procps redis-server supervisor \
  && apt-get install --only-upgrade -y libgnutls30 \
  && rm -rf /var/lib/apt/lists/*
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
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# Un --filter par app, chacun avec le suffixe `...` (sélectionne l'app ET
# TOUTES ses dépendances workspace, construites dans l'ordre topologique) —
# même correctif déjà documenté et vérifié dans apps/api|worker|web/
# Dockerfile, reproduit ici trois fois plutôt qu'un raccourci qui le
# recasserait (ex. `--filter @pgd/contracts... --filter @pgd/api` ne
# construit ni @pgd/database ni @pgd/config ni @pgd/messaging).
RUN pnpm --filter @pgd/api... build \
  && pnpm --filter @pgd/worker... build \
  && pnpm --filter @pgd/web... build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system pgd && useradd --system --gid pgd pgd
# npm bundle sa propre copie de `tar` (CVE-2026-59873) — cf. apps/api/
# Dockerfile pour la justification complète. Jamais invoqué au runtime ici
# non plus (supervisord lance `node`/`next start` directement).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /repo /repo
COPY docker/all-in-one/supervisord.conf /repo/docker/all-in-one/supervisord.conf
COPY docker/all-in-one/healthcheck.sh /repo/docker/all-in-one/healthcheck.sh
RUN chmod +x /repo/docker/all-in-one/healthcheck.sh \
  && mkdir -p /var/log/supervisor \
  && chown -R pgd:pgd /var/log/supervisor /repo
USER pgd
WORKDIR /repo
# 3000 api, 3001 web, 3002 worker (santé). Redis (6379) reste interne au
# conteneur, jamais publié — même principe que docker-compose.prod.yml
# (service redis, aucun `ports:`).
EXPOSE 3000 3001 3002
# Un seul HEALTHCHECK possible par image — vérifie les QUATRE process
# (redis + les trois liveness HTTP déjà éprouvés par service, cf.
# docker/all-in-one/healthcheck.sh) plutôt qu'un seul, sans quoi un worker
# ou un web mort passerait inaperçu tant que l'api répond encore.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD sh /repo/docker/all-in-one/healthcheck.sh
CMD ["/usr/bin/supervisord", "-c", "/repo/docker/all-in-one/supervisord.conf"]
