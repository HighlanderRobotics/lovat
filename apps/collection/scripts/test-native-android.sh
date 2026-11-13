#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p .maestro/results
: > .maestro/results/ledger.jsonl
fixture_pid=""
cleanup() {
  result=$?
  trap - EXIT
  printf '%s\n' "$result" > .maestro/results/exit-code.txt
  adb logcat -d > .maestro/results/logcat.txt 2>&1 || true
  adb shell getprop > .maestro/results/device.txt 2>&1 || true
  adb exec-out screencap -p > .maestro/results/screenshot.png 2>/dev/null || true
  adb shell cmd connectivity airplane-mode disable || true
  if [[ -n "$fixture_pid" ]]; then kill "$fixture_pid" 2>/dev/null || true; fi
  exit "$result"
}
trap cleanup EXIT
start_fixture() {
  NATIVE_LEDGER="$PWD/.maestro/results/ledger.jsonl" node test/native/fixture-api.mjs >.maestro/results/fixture.log 2>&1 &
  fixture_pid=$!
  for attempt in {1..30}; do
    if curl --fail --silent http://127.0.0.1:9877/healthz >/dev/null; then return; fi
    sleep 1
  done
  return 1
}
adb wait-for-device
adb reverse tcp:9877 tcp:9877
start_fixture
maestro test --debug-output .maestro/results/bootstrap-debug --test-output-dir .maestro/results/bootstrap-debug --format junit --output .maestro/results/bootstrap.xml .maestro/bootstrap.yaml
# Stop the fixture as well: an ADB reverse tunnel can survive airplane mode.
kill "$fixture_pid"
wait "$fixture_pid" || true
fixture_pid=""
adb shell cmd connectivity airplane-mode enable
# Start a fresh driver session after each orientation transition, preserving
# the app process and report state. Keep selection/start assertions in the
# landscape session rather than relying on a successful input command.
maestro test --debug-output .maestro/results/enter-game-debug --test-output-dir .maestro/results/enter-game-debug --format junit --output .maestro/results/enter-game.xml .maestro/enter-game.yaml
maestro test --debug-output .maestro/results/record-match-debug --test-output-dir .maestro/results/record-match-debug --format junit --output .maestro/results/record-match.xml .maestro/record-match.yaml
maestro test --debug-output .maestro/results/offline-debug --test-output-dir .maestro/results/offline-debug --format junit --output .maestro/results/offline.xml .maestro/offline-restart.yaml
adb shell cmd connectivity airplane-mode disable
start_fixture
maestro test --debug-output .maestro/results/reconnect-debug --test-output-dir .maestro/results/reconnect-debug --format junit --output .maestro/results/reconnect.xml .maestro/reconnect.yaml
node --input-type=module - <<'JS'
import {readFileSync} from 'node:fs';
const entries=readFileSync('.maestro/results/ledger.jsonl','utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const submitted=entries.filter(e=>e.path==='/collection/submit'||e.path==='/collection/scoutreports');
if(submitted.length!==1)throw new Error('Expected one successful synthetic report submission');
if(!entries.every(e=>e.uuid===submitted[0].uuid))throw new Error('Lifecycle/retry changed the report UUID');
console.log('Native restart/retry preserved UUID:',submitted[0].uuid);
JS
