FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
ARG LOVAT_API_BASE
ARG LOVAT_WEBSITE_URL
ARG LOVAT_SANDBOX_AUTH0_DOMAIN
ARG LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID
ARG LOVAT_SANDBOX_AUTH0_AUDIENCE
# Require an explicit backend; previews must not silently use production.
# The build also fails if sandbox Auth0 values are partial or point at production.
RUN test -n "$LOVAT_API_BASE" && test -n "$LOVAT_WEBSITE_URL" && npm run build

FROM caddy:2.10.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build /srv
ENV PORT=8080
EXPOSE 8080
