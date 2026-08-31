#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_paths=(
  README.md
  AGENTS.md
  docs/architecture.md
  apps/server/package.json
  apps/server/README.md
  apps/server/AGENTS.md
  apps/dashboard/pubspec.yaml
  apps/dashboard/README.md
  apps/dashboard/AGENTS.md
  apps/collection/package.json
  apps/collection/README.md
  apps/collection/AGENTS.md
  apps/website/package.json
  apps/website/README.md
  apps/website/AGENTS.md
  packages/README.md
)

for required_path in "${required_paths[@]}"; do
  if [[ ! -e "$repo_root/$required_path" ]]; then
    echo "Missing required path: $required_path" >&2
    exit 1
  fi
done

if find "$repo_root/apps" -mindepth 2 -name .git -print -quit | grep -q .; then
  echo "Nested .git directory found under apps/." >&2
  exit 1
fi

if git -C "$repo_root" ls-files | rg -q '(^|/)(node_modules|\.dart_tool|\.expo|build|dist)(/|$)'; then
  echo "Tracked generated dependency or build directory found." >&2
  exit 1
fi

if git -C "$repo_root" ls-files | rg -q '\.(jks|p8|p12|pem|key|mobileprovision)$'; then
  echo "Tracked signing file found." >&2
  exit 1
fi

echo "Monorepo structure is valid."
