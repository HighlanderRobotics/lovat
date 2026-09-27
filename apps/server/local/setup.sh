#!/usr/bin/env sh
set -eu

SERVER_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$SERVER_DIR/../.." && pwd)

. "$SERVER_DIR/local/env.sh"
. "$SERVER_DIR/local/runtime.sh"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22.20.0 is required. Install it, then rerun this command." >&2
  exit 1
fi

NODE_VERSION=$(node -p "process.versions.node")
if [ "$(node -p "process.versions.node.split('.')[0]")" != "22" ]; then
  echo "Node.js 22 is required; found $NODE_VERSION. Run 'nvm use' in apps/server, then retry." >&2
  exit 1
fi

if [ ! -f "$SERVER_DIR/.env" ]; then
  cp "$SERVER_DIR/.env.example" "$SERVER_DIR/.env"
  echo "Created apps/server/.env from .env.example; add optional integration keys there."
fi

echo "Installing server and database dependencies..."
npm --prefix "$SERVER_DIR" ci

echo "Starting local PostgreSQL and Redis..."
"$SERVER_DIR/local/native-services.sh" start

echo "Applying the committed database migrations..."
(
  cd "$REPO_DIR/packages/db"
  npm run db:deploy
)

echo "Local server prerequisites are ready. Run 'npm run local:dev' from apps/server."
