#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
platform=${1:-android}
device=${2:-emulator-5554}
case "$platform" in android|ios) ;; *) echo 'Expected android or ios' >&2; exit 1 ;; esac
mkdir -p test-report/native
git rev-parse HEAD > test-report/native/source-sha.txt
flutter --version > test-report/native/flutter-version.txt
grep '^version:' pubspec.yaml > test-report/native/candidate-version.txt
fixture_pid=""
cleanup() {
  result=$?
  trap - EXIT
  printf '%s\n' "$result" > test-report/native/exit-code.txt
  if [[ "$platform" == android ]]; then
    adb -s "$device" logcat -d > test-report/native/logcat.txt 2>&1 || true
    adb -s "$device" shell getprop > test-report/native/device.txt 2>&1 || true
    adb -s "$device" exec-out screencap -p > test-report/native/screenshot.png 2>/dev/null || true
    adb -s "$device" reverse --remove tcp:9878 || true
    apk=build/app/outputs/flutter-apk/app-debug.apk
    if [[ -f "$apk" ]]; then shasum -a 256 "$apk" > test-report/native/test-apk.sha256; fi
  else
    xcrun simctl io "$device" screenshot test-report/native/screenshot.png || true
    xcrun simctl list devices > test-report/native/device.txt || true
  fi
  if [[ -n "$fixture_pid" ]]; then kill "$fixture_pid" 2>/dev/null || true; fi
  exit "$result"
}
trap cleanup EXIT
node tool/fixture_api.mjs > test-report/native/fixture.log 2>&1 &
fixture_pid=$!
for attempt in {1..60}; do
  if curl -fsS http://127.0.0.1:9878/healthz >/dev/null; then break; fi
  if [[ "$attempt" == 60 ]]; then exit 1; fi
  sleep 0.5
done
if [[ "$platform" == android ]]; then adb -s "$device" reverse tcp:9878 tcp:9878; fi
flutter test integration_test/app_journey_test.dart -d "$device" --dart-define=LOVAT_API_BASE=http://127.0.0.1:9878 2>&1 | tee test-report/native/journey.log
