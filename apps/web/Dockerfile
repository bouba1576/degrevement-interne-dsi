FROM node:20-slim AS base
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
RUN pnpm --filter @pgd/contracts... --filter @pgd/web build

FROM base AS runtime
ENV NODE_ENV=production
RUN groupadd --system pgd && useradd --system --gid pgd pgd
COPY --from=build /repo /repo
USER pgd
WORKDIR /repo/apps/web
EXPOSE 3001
CMD ["node_modules/.bin/next", "start", "-p", "3001"]
