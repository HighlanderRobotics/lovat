# Build from repository root; production traffic stays on apps/server until cutover.
FROM oven/bun:1.4.4 AS bun
FROM node:22.20.0-bookworm-slim AS build
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/api ./packages/api
COPY packages/games ./packages/games
COPY packages/db ./packages/db
COPY apps/api ./apps/api
# Shared packages retain their independent npm lockfiles.
RUN npm --prefix packages/api ci --ignore-scripts && npm --prefix packages/api run build
RUN npm --prefix packages/games ci --ignore-scripts && npm --prefix packages/games run build
RUN npm --prefix packages/db ci --include=dev && npm --prefix packages/db run build
WORKDIR /app/apps/api
RUN bun install --frozen-lockfile --ignore-scripts && bun run build

FROM oven/bun:1.4.4-debian AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=bun:bun /app/packages ./packages
COPY --from=build --chown=bun:bun /app/apps/api ./apps/api
WORKDIR /app/apps/api
ENV NODE_ENV=production
USER bun
CMD ["bun", "--smol", "dist/server.js"]
