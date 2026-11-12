#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
# This creates generated native projects; use a fresh disposable checkout only.
test "${LOVAT_DISPOSABLE_BUILD:-}" = 1
test ! -e android
export CI=1 EXPO_NO_DOTENV=1 EXPO_PUBLIC_API_URL=http://127.0.0.1:9877
mkdir -p .maestro/results candidate
npx expo prebuild --platform android --no-install
# Test-only loopback access, applied to generated files, never app.json or EAS.
python3 - <<'PY'
from pathlib import Path
import xml.etree.ElementTree as ET
ns = 'http://schemas.android.com/apk/res/android'
ET.register_namespace('android', ns)
p = Path('android/app/src/main/AndroidManifest.xml')
tree = ET.parse(p)
app = tree.getroot().find('application')
app.set(f'{{{ns}}}networkSecurityConfig', '@xml/native_test_network_security')
app.set(f'{{{ns}}}usesCleartextTraffic', 'false')
tree.write(p, encoding='utf-8', xml_declaration=True)
p = Path('android/app/src/main/res/xml/native_test_network_security.xml')
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text('''<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain>127.0.0.1</domain><domain>localhost</domain>
  </domain-config>
</network-security-config>
''')
PY
(cd android && ./gradlew :app:assembleRelease -PreactNativeArchitectures=x86_64 --no-daemon --stacktrace) 2>&1 | tee .maestro/results/build.log
cp android/app/build/outputs/apk/release/app-release.apk candidate/collection-native-test.apk
# A standalone bundle is required: a Metro-dependent development client cannot pass.
unzip -l candidate/collection-native-test.apk | grep 'assets/index.android.bundle'
git rev-parse HEAD > candidate/source-sha.txt
node -p 'JSON.stringify(require("./app.json").expo)' > candidate/app-config.json
sha256sum candidate/collection-native-test.apk > candidate/apk.sha256
