# Build from the repository root: docker build -f apps/worker/Dockerfile .
FROM oven/bun:1.3.14-debian AS bun

FROM node:22.20.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY packages/db ./packages/db
RUN npm --prefix packages/db ci --include=dev && npm --prefix packages/db run build

COPY apps/worker ./apps/worker
WORKDIR /app/apps/worker
# Build the local database dependency before Bun copies it into node_modules.
RUN bun install --frozen-lockfile --ignore-scripts && bun run typecheck

ENV NODE_ENV=production
ENV PORT=8080
USER node
EXPOSE 8080
CMD ["bun", "index.ts"]
