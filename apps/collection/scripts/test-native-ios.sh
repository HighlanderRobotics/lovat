#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# Never build or clear app data outside a disposable macOS Actions checkout.
test "${GITHUB_ACTIONS:-}" = true
test "${LOVAT_DISPOSABLE_BUILD:-}" = 1
test "$(uname -s)" = Darwin
test "$(uname -m)" = arm64
test "$(git rev-parse HEAD)" = "${LOVAT_EXPECTED_SOURCE_SHA:?Exact Actions source revision required}"
test ! -e ios
export CI=1 EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:9877
export EXPO_NO_TELEMETRY=1 MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_DRIVER_STARTUP_TIMEOUT=120000

app_id=com.frc8033.lovatcollection
results="$PWD/.maestro/results/ios"
fixture_pid=""
simulator=""
mkdir -p "$results"
printf '%s\n' "$LOVAT_EXPECTED_SOURCE_SHA" > "$results/source-sha.txt"
printf '%s\n' 'Simulator endpoint outage and process restart; not airplane mode, LAN consent, physical camera, QR or signed-device acceptance.' > "$results/scope.txt"
: > "$results/ledger.jsonl"

stop_fixture() {
  if [[ -n "$fixture_pid" ]]; then
    kill "$fixture_pid" 2>/dev/null || true
    wait "$fixture_pid" || true
    fixture_pid=""
  fi
}

cleanup() {
  local result=$?
  trap - EXIT
  stop_fixture
  printf '%s\n' "$result" > "$results/exit-code.txt"
  if [[ -n "$simulator" ]]; then
    xcrun simctl io "$simulator" screenshot "$results/screenshot.png" || true
    xcrun simctl spawn "$simulator" log show --last 5m --style compact \
      --predicate 'process == "Collection"' > "$results/simulator-app.log" 2>&1 || true
    xcrun simctl shutdown "$simulator" || true
    xcrun simctl delete "$simulator" || true
  fi
  exit "$result"
}
trap cleanup EXIT

xcodebuild -version | tee "$results/xcode.txt"
grep -Eq '^Xcode 27\.' "$results/xcode.txt"
xcrun simctl list runtimes available | tee "$results/runtimes.txt"
maestro --version | tee "$results/maestro.txt"
simulator="$(xcrun simctl create 'Lovat CI iOS' \
  com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro com.apple.CoreSimulator.SimRuntime.iOS-27-0)"
xcrun simctl list devices available > "$results/devices.txt"
printf '%s\n' "$simulator" > "$results/device-udid.txt"

# Generate and patch only the disposable Simulator project, never EAS or app.json.
npx expo prebuild --platform ios --no-install 2>&1 | tee "$results/prebuild.log"
python3 - <<'PY'
import pathlib
import plistlib

plist, = pathlib.Path("ios").glob("*/Info.plist")
info = plistlib.loads(plist.read_bytes())
# iOS 17+ supports explicit numeric IP entries in NSExceptionDomains.
info["NSAppTransportSecurity"] = {
    "NSAllowsArbitraryLoads": False,
    "NSExceptionDomains": {
        "127.0.0.1": {"NSExceptionAllowsInsecureHTTPLoads": True},
    },
}
plist.write_bytes(plistlib.dumps(info))
PY
(cd ios && pod install) 2>&1 | tee "$results/pods.log"
derived="${RUNNER_TEMP:?Actions temporary directory required}/lovat-collection-ios"
xcodebuild -workspace ios/Collection.xcworkspace -scheme Collection -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$derived" CODE_SIGNING_ALLOWED=NO ARCHS=arm64 build \
  2>&1 | tee "$results/build.log"

app="$derived/Build/Products/Release-iphonesimulator/Collection.app"
test "$(plutil -extract CFBundleIdentifier raw -o - "$app/Info.plist")" = "$app_id"
test -s "$app/main.jsbundle"
grep -aFq "$EXPO_PUBLIC_API_URL" "$app/main.jsbundle"
if grep -aFq 'https://api.lovat.app' "$app/main.jsbundle"; then
  echo 'Refusing to launch: the synthetic bundle contains the production API.' >&2
  exit 1
fi
plutil -extract NSAppTransportSecurity xml1 -o "$results/ats.plist" "$app/Info.plist"
executable="$(plutil -extract CFBundleExecutable raw -o - "$app/Info.plist")"
shasum -a 256 "$app/$executable" "$app/main.jsbundle" > "$results/executable-and-bundle.sha256"
{
  plutil -extract CFBundleShortVersionString raw -o - "$app/Info.plist"
  plutil -extract CFBundleVersion raw -o - "$app/Info.plist"
} > "$results/version.txt"

xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b
xcrun simctl install "$simulator" "$app"

health() {
  curl --noproxy '*' --fail --silent --max-time 2 "$EXPO_PUBLIC_API_URL/healthz" >/dev/null
}

start_fixture() {
  NATIVE_LEDGER="$results/ledger.jsonl" node test/native/fixture-api.mjs >> "$results/fixture.log" 2>&1 &
  fixture_pid=$!
  for attempt in {1..30}; do
    if kill -0 "$fixture_pid" 2>/dev/null && health; then return; fi
    sleep 1
  done
  echo 'Synthetic fixture failed to start.' >&2
  return 1
}

stage() {
  local name="$1"
  maestro --device "$simulator" test --debug-output "$results/$name-debug" \
    --test-output-dir "$results/$name-debug" --format junit --output "$results/$name.xml" ".maestro/$name.yaml"
}

if health; then
  echo 'Refusing to reuse a service on the synthetic fixture port.' >&2
  exit 1
fi
start_fixture
stage bootstrap
stage enter-game
# Capture the real app's report UUID while only the initial load is online.
for attempt in {1..20}; do
  if grep -q '"path":"/collection/load"' "$results/ledger.jsonl"; then break; fi
  sleep 1
done
node scripts/check-native-ios-ledger.mjs before "$results/ledger.jsonl" > "$results/report-uuid.txt"
stop_fixture
if health; then
  echo 'The fixture is still reachable; endpoint outage was not established.' >&2
  exit 1
fi
stage record-match
stage end-match
stage offline-restart
start_fixture
stage reconnect
node scripts/check-native-ios-ledger.mjs after "$results/ledger.jsonl" "$(cat "$results/report-uuid.txt")"
