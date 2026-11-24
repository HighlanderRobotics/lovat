# Build from the repository root: docker build -f apps/server/Dockerfile .
FROM node:22.20.0-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates tini && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY packages/db/package*.json ./packages/db/
COPY apps/server/package*.json ./apps/server/
RUN npm --prefix packages/db ci --include=dev --no-audit --no-fund \
    && npm --prefix apps/server ci --include=dev --ignore-scripts --no-audit --no-fund

COPY packages/db/prisma ./packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/tsconfig.json ./packages/db/
COPY packages/db/src ./packages/db/src
COPY apps/server/tsconfig.json ./apps/server/
COPY apps/server/src ./apps/server/src

# Build the shared package once instead of re-running Server's local postinstall
# and prebuild hooks. Keep Prisma's migration CLI, but prune build/test packages.
# npm retains TypeScript as an optional Prisma peer; migration loads
# prisma.config.ts with Prisma's own loader, not the compiler.
RUN npm --prefix packages/db run build \
    && npm --prefix apps/server --ignore-scripts run build \
    && npm --prefix apps/server prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && npm --prefix packages/db prune --omit=dev --ignore-scripts --no-audit --no-fund \
    && rm -rf packages/db/node_modules/typescript \
        packages/db/node_modules/.bin/tsc packages/db/node_modules/.bin/tsserver

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/packages/db/package.json ./packages/db/
COPY --from=build /app/packages/db/prisma.config.ts ./packages/db/
COPY --from=build /app/packages/db/prisma ./packages/db/prisma
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/node_modules ./packages/db/node_modules
WORKDIR /app/apps/server
COPY --from=build /app/apps/server/package.json ./
COPY --from=build /app/apps/server/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY apps/server/public ./public
# Leave app files root-owned; the runtime can read but not modify them.
USER node
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/src/server.js"]
