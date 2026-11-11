#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p test-report/native
node tool/fixture_api.mjs > test-report/native/fixture.log 2>&1 &
fixture_pid=$!
trap 'kill "$fixture_pid" 2>/dev/null || true' EXIT
for attempt in {1..60}; do
  if curl -fsS http://127.0.0.1:9878/healthz >/dev/null; then break; fi
  if [[ "$attempt" == 60 ]]; then exit 1; fi
  sleep 0.5
done
adb reverse tcp:9878 tcp:9878
flutter test integration_test/app_journey_test.dart -d emulator-5554 --dart-define=LOVAT_API_BASE=http://127.0.0.1:9878 2>&1 | tee test-report/native/journey.log
