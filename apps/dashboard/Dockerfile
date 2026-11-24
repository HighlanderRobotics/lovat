FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git unzip xz-utils zip libglu1-mesa && rm -rf /var/lib/apt/lists/*
RUN git clone --depth 1 --branch 3.41.0 https://github.com/flutter/flutter.git /opt/flutter
ENV PATH="/opt/flutter/bin:${PATH}"
RUN flutter config --no-analytics && flutter precache --web
WORKDIR /app
COPY . .
ARG LOVAT_API_BASE
ARG LOVAT_WEBSITE_URL
ARG LOVAT_SANDBOX_AUTH0_DOMAIN
ARG LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID
ARG LOVAT_SANDBOX_AUTH0_AUDIENCE
# Require an explicit backend in Railway; previews must not silently use production.
RUN test -n "$LOVAT_API_BASE" && test -n "$LOVAT_WEBSITE_URL" \
    && flutter pub get \
    && dart run tool/check_sandbox_web_auth.dart \
    && set -- build web --release --dart-define="LOVAT_API_BASE=$LOVAT_API_BASE" --dart-define="LOVAT_WEBSITE_URL=$LOVAT_WEBSITE_URL" \
    && if [ "${LOVAT_SANDBOX_AUTH0_DOMAIN+x}${LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID+x}${LOVAT_SANDBOX_AUTH0_AUDIENCE+x}" ]; then \
         set -- "$@" --dart-define="LOVAT_SANDBOX_AUTH0_DOMAIN=$LOVAT_SANDBOX_AUTH0_DOMAIN" \
           --dart-define="LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID=$LOVAT_SANDBOX_AUTH0_WEB_CLIENT_ID" \
           --dart-define="LOVAT_SANDBOX_AUTH0_AUDIENCE=$LOVAT_SANDBOX_AUTH0_AUDIENCE"; \
       fi \
    && flutter "$@"

FROM caddy:2.10.2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/build/web /srv
ENV PORT=8080
EXPOSE 8080
