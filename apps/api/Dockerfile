FROM node:24-slim AS base
# procps fournit `ps`, utilisé par `nest start --watch` (apps/api en dev, cf.
# docker-compose.override.yml) pour retrouver/tuer le process enfant à chaque
# redémarrage à chaud. Sans lui, tout changement de fichier détecté fait
# planter le conteneur (spawn ps ENOENT) au lieu de recompiler — constaté en
# Phase 4, probablement la cause des redémarrages « silencieux » observés
# depuis la Phase 2.
# --only-upgrade sur libgnutls30 (CVE-2026-33845, CVE-2026-42010 — Trivy) :
# le correctif Debian (3.7.9-2+deb12u7) existe déjà dans les dépôts au moment
# de ce build, vérifié via `apt-cache policy libgnutls30` avant d'écrire
# cette ligne — un simple `apt-get update` suffit, pas besoin de changer de
# tag d'image de base. Ciblé sur ce paquet précis (pas un `apt-get upgrade`
# général) pour garder le changement traçable à ce CVE exact.
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
# --filter @pgd/api... (suffixe, pas préfixe) sélectionne @pgd/api ET TOUTES
# ses dépendances workspace (@pgd/config, @pgd/contracts, @pgd/database,
# @pgd/messaging), construites dans l'ordre topologique — l'ancienne commande
# (--filter @pgd/contracts... --filter @pgd/api) ne construisait ni
# @pgd/database ni @pgd/config ni @pgd/messaging (le `...` en suffixe sur
# contracts sélectionne les dépendances DE contracts, pas les dépendances
# d'api), laissant `packages/database/dist` absent : `nest build` retombait
# alors sur `any` implicite pour tout type dérivé de Prisma (@pgd/database
# n'exporte que PrismaClient, jamais @prisma/client directement — apps/api
# n'a donc aucun autre chemin de résolution). Jamais détecté avant : la CI
# ne construit jamais l'image Docker (turbo build tourne nu sur le runner).
RUN pnpm --filter @pgd/api... build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system pgd && useradd --system --gid pgd pgd
# npm bundle sa propre copie de `tar` (CVE-2026-59873, Trivy — 6.2.1, jamais
# géré par notre pnpm-lock.yaml : ce n'est ni une dépendance directe ni
# transitive de nos packages, juste un composant interne de l'installation
# npm livrée avec l'image node:20-slim). npm n'est jamais invoqué au runtime
# (CMD lance `node` directement) — supprimé plutôt que mis à jour, ce qui
# élimine le CVE au lieu de le déplacer vers une version majeure de tar
# jamais auditée pour notre usage (aucun, de toute façon).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /repo /repo
USER pgd
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
