#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
node - <<'JS'
for (const [name,protocol,path] of [['DATABASE_URL','postgresql:','/lovat_test'],['REDIS_URL','redis:','/15']]) {
 const url=new URL(process.env[name]??'invalid');
 if(process.env.LOVAT_DB_TEST!=='1'||url.protocol!==protocol||!['localhost','127.0.0.1'].includes(url.hostname)||url.pathname!==path)throw new Error('Use disposable loopback lovat_test/Redis 15 with LOVAT_DB_TEST=1');
}
JS
node_path() {
  local required_version
  required_version="$(tr -d 'v[:space:]' < "$repo_root/apps/$1/.nvmrc")"
  local installed_bin="${LOVAT_NODE_ROOT:-$HOME/.nvm/versions/node}/v$required_version/bin"
  if [[ -x "$installed_bin/node" ]]; then printf '%s' "$installed_bin"; return; fi
  if [[ "$(node --version)" == "v$required_version" ]]; then dirname "$(command -v node)"; return; fi
  echo "Install Node $required_version for $1 (or set LOVAT_NODE_ROOT)." >&2
  return 1
}
collection_bin="$(node_path collection)"
server_bin="$(node_path server)"
export LOVAT_CONTRACT_OUTPUT_DIR="$repo_root/contract-report"
export LOVAT_CONTRACT_COLLECTION_DIR="$LOVAT_CONTRACT_OUTPUT_DIR"
export LOVAT_CONTRACT_SERVER_RESPONSE="$LOVAT_CONTRACT_OUTPUT_DIR/analysis.actual.json"
export DOTENV_CONFIG_PATH=/dev/null
mkdir -p "$LOVAT_CONTRACT_OUTPUT_DIR"
collection=not-run
server=not-run
dashboard=not-run
finish() {
  local result="$1"
  CONTRACT_STEPS="{\"collection\":{\"outcome\":\"$collection\"},\"server\":{\"outcome\":\"$server\"},\"dashboard\":{\"outcome\":\"$dashboard\"}}" \
    "$server_bin/node" scripts/prepare-contract-report.mjs "$LOVAT_CONTRACT_OUTPUT_DIR" || result=1
  exit "$result"
}
trap 'finish "$?"' EXIT
collection=failure
(cd apps/collection && PATH="$collection_bin:$PATH" npm run test:unit -- --testPathPatterns crossAppContract) 2>&1 | tee "$LOVAT_CONTRACT_OUTPUT_DIR/collection.log"
collection=success
server=failure
(cd apps/server && PATH="$server_bin:$PATH" npm run test:integration -- test/crossAppContract.integration.test.ts) 2>&1 | tee "$LOVAT_CONTRACT_OUTPUT_DIR/server.log"
server=success
dashboard=failure
(cd apps/dashboard && flutter test test/cross_app_contract_test.dart) 2>&1 | tee "$LOVAT_CONTRACT_OUTPUT_DIR/dashboard.log"
dashboard=success
