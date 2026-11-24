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
# The application preload allows only the fixture API; browser routes block external requests.
node_version=$(tr -d 'v\r\n' < .nvmrc)
fixture_image="node:${node_version}-bookworm-slim"
docker pull "$fixture_image"
docker network create "$network" >/dev/null
stub=$(docker run -d --network "$network" --network-alias stub -e FIXTURE_HOST=0.0.0.0 -v "$PWD/test/fixtures:/fixtures:ro" "$fixture_image" node /fixtures/server.mjs)
app=$(docker run -d --network "$network" -p 127.0.0.1::8080 -v "$PWD/test/block-outbound.mjs:/test/block-outbound.mjs:ro" -e LOVAT_API_BASE=http://stub:9876 -e LOVAT_SIGNING_KEY=synthetic-browser-key -e PUBLIC_LEARN_URL=http://127.0.0.1:4321 -e PUBLIC_DASHBOARD_URL=http://127.0.0.1:4322 "$image" node --import /test/block-outbound.mjs build)
# Verify the actual runtime, not just the Dockerfile's declared tag.
actual_node_version=$(docker exec "$app" node -p process.versions.node)
[[ "$actual_node_version" == "$node_version" ]]
port=$(docker port "$app" 8080/tcp | awk -F: '{print $NF}')
export TEST_BASE_URL="http://127.0.0.1:$port"
ready=false
for attempt in {1..60}; do
  if curl --fail --silent "$TEST_BASE_URL/healthz" >/dev/null; then ready=true; break; fi
  sleep 1
done
[[ "$ready" == true ]]
npm run test:e2e
