#!/usr/bin/env bash
set -uo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failures=0

run_group() {
  local label="$1"
  shift
  echo "==> $label"
  if "$@"; then
    echo "PASS: $label"
  else
    echo "FAIL: $label" >&2
    failures=$((failures + 1))
  fi
}

check_server() {
  cd "$repo_root/apps/server" || return
  npm run build && npm test && npm run lint
}

check_collection() {
  cd "$repo_root/apps/collection" || return
  npm run lint && npm run format:check && npm run ts:check
}

check_dashboard() {
  cd "$repo_root/apps/dashboard" || return
  flutter analyze && dart format --output=none --set-exit-if-changed .
}

check_website() {
  cd "$repo_root/apps/website" || return
  npm run check && npm run lint && npm run build
}

run_group "Structure" "$repo_root/scripts/check-structure.sh"
run_group "Server" check_server
run_group "Collection" check_collection
run_group "Dashboard" check_dashboard
run_group "Website" check_website

if (( failures > 0 )); then
  echo "$failures check group(s) failed. Compare with docs/migration/baseline-before.md." >&2
  exit 1
fi

echo "All check groups passed."
