#!/usr/bin/env sh
set -eu

SERVER_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

"$SERVER_DIR/local/native-services.sh" stop
