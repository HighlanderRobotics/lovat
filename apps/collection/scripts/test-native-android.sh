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
  if [[ "$result" -ne 0 ]]; then
    # Preserve the failure above, then compare Android's own input path with
    # Maestro's tap. This diagnostic never changes the original test result.
    python3 - <<'PY' > .maestro/results/input-diagnostic.txt 2>&1 || true
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET
out = Path('.maestro/results')
def hierarchy(name):
    subprocess.run(['adb', 'shell', 'uiautomator', 'dump', '/sdcard/collection-diagnostic.xml'], check=True, timeout=20)
    data = subprocess.check_output(['adb', 'exec-out', 'cat', '/sdcard/collection-diagnostic.xml'], timeout=10)
    (out / name).write_bytes(data)
    return ET.fromstring(data)
tree = hierarchy('input-before.xml')
hub = next((n for n in tree.iter('node') if n.get('content-desc') == 'Start position Hub'), None)
if hub is not None and hub.get('selected') == 'false':
    x1, y1, x2, y2 = map(int, re.findall(r'\d+', hub.get('bounds')))
    point = [str((x1 + x2) // 2), str((y1 + y2) // 2)]
    print('Diagnostic Android input tap at', point, flush=True)
    subprocess.run(['adb', 'shell', 'input', 'tap', *point], check=True, timeout=10)
    time.sleep(1)
    hierarchy('input-after.xml')
    (out / 'input-after.png').write_bytes(subprocess.check_output(['adb', 'exec-out', 'screencap', '-p'], timeout=10))
PY
  fi
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
