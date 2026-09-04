# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# BAZAAR API - production image  (Phase 12.2)
#
#   docker build -f apps/api/Dockerfile -t bazaar-api .      <- from the repo ROOT
#   docker run --env-file .env -p 4000:4000 bazaar-api
#
# The build context is the repository root, not apps/api. It has to be: this is
# a pnpm workspace, the Prisma schema lives at prisma/schema.prisma, and the API
# imports @bazaar/shared from packages/. A context rooted at apps/api can see
# none of that.
# ---------------------------------------------------------------------------

# Node 22, matching .nvmrc and the engines field, rather than the blueprint's
# node:20-alpine. The lockfile was resolved under 22 and argon2 and sharp both
# ship native binaries per ABI - building on one major and running on another is
# the kind of mismatch that passes CI and segfaults in production.
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate
WORKDIR /app


# --- deps ------------------------------------------------------------------
# Manifests only, so this layer is rebuilt when a dependency changes and reused
# on every commit that only touches source. It is by far the slowest step.
FROM base AS deps

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json      apps/api/
COPY apps/web/package.json      apps/web/
COPY packages/config/package.json packages/config/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json     packages/ui/
# The root postinstall runs `prisma generate`, which needs the schema present.
COPY prisma/schema.prisma prisma/schema.prisma

# The whole workspace, not `--filter @bazaar/api...`. Filtering deselects the
# root package, and the root package is where the prisma CLI and the generate
# postinstall live - so the filtered install is faster and produces an image
# with no Prisma client in it. This stage is discarded anyway.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile


# --- build -----------------------------------------------------------------
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps ./apps
COPY --from=deps /app/packages ./packages
COPY . .

# @bazaar/shared compiles to dist and the API imports the built output, so it
# has to be built first. Turbo's `dependsOn: ["^build"]` handles the ordering.
RUN pnpm --filter @bazaar/shared build \
 && pnpm --filter @bazaar/api build

# Drop devDependencies in place. @nestjs/cli, ts-jest, eslint and typescript are
# roughly two thirds of node_modules and none of them run in production. Prisma
# survives because it is a *dependency* of @bazaar/api - the entrypoint runs
# `prisma migrate deploy`, so the CLI has to be in the runtime image.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
 && pnpm --filter @bazaar/api exec prisma generate --schema=/app/prisma/schema.prisma


# --- runtime ---------------------------------------------------------------
FROM node:22-alpine AS runner

# tini reaps zombies and, more importantly, forwards SIGTERM to the Node
# process. As PID 1 without it, a container gets 10 seconds of being ignored and
# then SIGKILL - which on a rolling deploy means cutting off in-flight
# checkouts instead of draining them (D3).
RUN apk add --no-cache tini

ENV NODE_ENV=production
# Alpine's musl allocator fragments under sharp's image buffers; the small
# arena count is the documented fix and keeps RSS flat across a long uptime.
ENV MALLOC_ARENA_MAX=2
WORKDIR /app

# node:alpine ships an unprivileged `node` user (uid 1000). Running as root
# inside a container turns a code-execution bug into a container escape
# primitive, and nothing here needs privileges.
COPY --from=build --chown=node:node /app/node_modules            ./node_modules
COPY --from=build --chown=node:node /app/package.json            ./package.json
COPY --from=build --chown=node:node /app/prisma                  ./prisma
COPY --from=build --chown=node:node /app/apps/api/node_modules   ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/package.json   ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/dist           ./apps/api/dist
COPY --from=build --chown=node:node /app/packages/shared         ./packages/shared
COPY --chown=node:node apps/api/docker-entrypoint.sh             ./docker-entrypoint.sh

RUN chmod +x ./docker-entrypoint.sh

USER node

ENV API_PORT=4000
EXPOSE 4000

# Belt to Railway's braces: the platform probes /health/ready over HTTP, and
# this catches a process that is alive but wedged even when the platform's
# probe is misconfigured.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/'+(process.env.API_GLOBAL_PREFIX||'api/v1')+'/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--", "./docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
