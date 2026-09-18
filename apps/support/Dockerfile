# Build from the repository root: docker build -f apps/support/Dockerfile .
FROM oven/bun:1.3.14 AS bun
FROM node:22.20.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app/packages/db
COPY packages/db/package.json packages/db/package-lock.json ./
RUN npm ci --include=dev
COPY packages/db/ ./
RUN npm run build
WORKDIR /app/apps/support
COPY apps/support/package.json apps/support/bun.lock ./
RUN bun install --frozen-lockfile
COPY apps/support/ ./
RUN bun run build
ENV NODE_ENV=production
USER node
CMD ["bun", "run", "start"]
