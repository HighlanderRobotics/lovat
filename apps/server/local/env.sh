#!/usr/bin/env sh

# Keep local development commands pinned to the isolated managed services.
# Exported values take precedence over values loaded from .env by dotenv.
export DATABASE_URL="postgresql://lovat@127.0.0.1:55432/lovat_dev"
export REDIS_URL="redis://127.0.0.1:56379/0"
export PORT="${PORT:-3000}"
export BASE_URL="${BASE_URL:-http://localhost:${PORT}}"
