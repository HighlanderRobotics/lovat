#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
image="lovat-website-test:${GITHUB_RUN_ID:-local}"
network="lovat-website-test-$$"
app=""
stub=""
cleanup() {
  if [[ -n "$app" ]]; then docker logs "$app"; docker rm -f "$app" >/dev/null; fi
  if [[ -n "$stub" ]]; then docker rm -f "$stub" >/dev/null; fi
  docker network rm "$network" >/dev/null || true
}
trap cleanup EXIT
docker build -f Dockerfile -t "$image" ../..
# Pre-pull before creating an internal network: neither runtime can access the Internet.
docker pull node:20.19.6-bookworm-slim
docker network create --internal "$network" >/dev/null
stub=$(docker run -d --network "$network" --network-alias stub -e FIXTURE_HOST=0.0.0.0 -v "$PWD/test/fixtures:/fixtures:ro" node:20.19.6-bookworm-slim node /fixtures/server.mjs)
app=$(docker run -d --network "$network" -p 127.0.0.1::8080 -e LOVAT_API_BASE=http://stub:9876 -e LOVAT_SIGNING_KEY=synthetic-browser-key -e PUBLIC_LEARN_URL=http://127.0.0.1:4321 -e PUBLIC_DASHBOARD_URL=http://127.0.0.1:4322 "$image")
port=$(docker port "$app" 8080/tcp | awk -F: '{print $NF}')
export TEST_BASE_URL="http://127.0.0.1:$port"
ready=false
for attempt in {1..60}; do
  if curl --fail --silent "$TEST_BASE_URL/healthz" >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
npm run test:e2e
