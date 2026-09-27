#!/usr/bin/env sh
set -eu

SERVER_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

. "$SERVER_DIR/local/env.sh"
. "$SERVER_DIR/local/runtime.sh"

"$SERVER_DIR/local/native-services.sh" start
exec npm --prefix "$SERVER_DIR" run dev
