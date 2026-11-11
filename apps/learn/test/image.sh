#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
image="lovat-learn-test:${GITHUB_RUN_ID:-local}"
container=""
cleanup() { if [[ -n "$container" ]]; then docker logs "$container"; docker rm -f "$container" >/dev/null; fi; }
trap cleanup EXIT
docker build --build-arg PUBLIC_WEBSITE_URL=http://127.0.0.1:4322 -t "$image" .
container=$(docker run -d -p 127.0.0.1::8080 "$image")
port=$(docker port "$container" 8080/tcp | awk -F: '{print $NF}')
export TEST_BASE_URL="http://127.0.0.1:$port"
ready=false
for attempt in {1..60}; do
  if curl --fail --silent "$TEST_BASE_URL/healthz" >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
npm run test:e2e
