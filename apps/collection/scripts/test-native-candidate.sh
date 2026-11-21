#!/usr/bin/env bash
set -euo pipefail
candidate=$(find "${1:?Candidate artifact directory required}" -name '*.apk' -type f)
test -n "$candidate"
test "$(printf '%s\n' "$candidate" | wc -l)" -eq 1
mkdir -p "$(dirname "$0")/../.maestro/results"
shasum -a 256 "$candidate" > "$(dirname "$0")/../.maestro/results/test-apk.sha256"
git rev-parse HEAD > "$(dirname "$0")/../.maestro/results/source-sha.txt"
adb install "$candidate"
bash "$(dirname "$0")/test-native-android.sh"
