FROM node:22.20.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_WEBSITE_URL
ENV PUBLIC_WEBSITE_URL=$PUBLIC_WEBSITE_URL
RUN test -n "$PUBLIC_WEBSITE_URL" && npm run build

FROM caddy:2.10.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV PORT=8080
EXPOSE 8080
