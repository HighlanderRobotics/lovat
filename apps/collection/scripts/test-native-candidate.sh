#!/usr/bin/env bash
set -euo pipefail
candidate=$(find "${1:?Candidate artifact directory required}" -name '*.apk' -type f)
test -n "$candidate"
test "$(printf '%s\n' "$candidate" | wc -l)" -eq 1
adb install "$candidate"
bash "$(dirname "$0")/test-native-android.sh"
