#!/usr/bin/env sh
set -eu

SERVER_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
REPO_DIR=$(CDPATH= cd -- "$SERVER_DIR/../.." && pwd)
STATE_DIR="$REPO_DIR/.local/server"
POSTGRES_DIR="$STATE_DIR/postgres"
POSTGRES_LOG="$STATE_DIR/postgres.log"
REDIS_DIR="$STATE_DIR/redis"
REDIS_LOG="$STATE_DIR/redis.log"
REDIS_PID="$STATE_DIR/redis.pid"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "$1 is required for local server development." >&2
    exit 1
  fi
}

case "${1:-}" in
  start)
    for command in initdb pg_ctl pg_isready createdb psql redis-server redis-cli; do
      require_command "$command"
    done
    mkdir -p "$STATE_DIR" "$REDIS_DIR"

    if [ ! -f "$POSTGRES_DIR/PG_VERSION" ]; then
      initdb -D "$POSTGRES_DIR" --auth=trust --username=lovat >/dev/null
    fi
    if ! pg_ctl -D "$POSTGRES_DIR" status >/dev/null 2>&1; then
      pg_ctl -D "$POSTGRES_DIR" -l "$POSTGRES_LOG" \
        -o "-h 127.0.0.1 -p 55432" start >/dev/null
    fi
    if ! psql -h 127.0.0.1 -p 55432 -U lovat -d postgres -Atqc \
      "SELECT 1 FROM pg_database WHERE datname = 'lovat_dev'" | grep -q 1; then
      createdb -h 127.0.0.1 -p 55432 -U lovat lovat_dev
    fi

    if ! redis-cli -h 127.0.0.1 -p 56379 ping >/dev/null 2>&1; then
      redis-server --daemonize yes --bind 127.0.0.1 --port 56379 \
        --dir "$REDIS_DIR" --dbfilename dump.rdb --pidfile "$REDIS_PID" \
        --logfile "$REDIS_LOG"
    fi
    pg_isready -h 127.0.0.1 -p 55432 -d lovat_dev >/dev/null
    redis-cli -h 127.0.0.1 -p 56379 ping >/dev/null
    ;;
  stop)
    if [ -f "$POSTGRES_DIR/PG_VERSION" ] && pg_ctl -D "$POSTGRES_DIR" status >/dev/null 2>&1; then
      pg_ctl -D "$POSTGRES_DIR" stop >/dev/null
    fi
    if command -v redis-cli >/dev/null 2>&1; then
      redis-cli -h 127.0.0.1 -p 56379 shutdown >/dev/null 2>&1 || true
    fi
    ;;
  *)
    echo "Usage: $0 {start|stop}" >&2
    exit 2
    ;;
esac
