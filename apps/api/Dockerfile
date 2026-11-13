# Build from repository root; deployment remains on apps/server until qualified.
FROM node:22.20.0-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/api ./packages/api
COPY packages/db ./packages/db
COPY apps/api ./apps/api
RUN npm --prefix packages/db ci --include=dev && npm --prefix packages/db run build
RUN npm --prefix apps/api ci --include=dev && npm --prefix apps/api run build
WORKDIR /app/apps/api
ENV NODE_ENV=production
CMD ["npm", "start"]
