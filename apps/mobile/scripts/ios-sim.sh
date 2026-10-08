#!/usr/bin/env bash
# Builds the debug dev client, installs it on a booted simulator and points it
# at Metro. `expo run:ios` can't do this with Xcode 27: `devicectl` lists booted
# simulators as connected devices, Expo CLI takes them for phones and asks for
# a signing certificate.
#
# Usage: scripts/ios-sim.sh [simulator udid] (default: the first booted iPhone)
# Env: METRO_PORT (default 8081), SKIP_BUILD=1 to reinstall the last build.
set -euo pipefail
cd "$(dirname "$0")/.."

port="${METRO_PORT:-8081}"
udid="${1:-$(xcrun simctl list devices booted -j | node -e '
  const { devices } = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const phone = Object.values(devices).flat().find((d) => d.name.startsWith("iPhone"));
  if (!phone) process.exit(1);
  console.log(phone.udid);
')}"

if [[ "${SKIP_BUILD:-}" != 1 ]]; then
  [[ -d ios ]] || npx expo prebuild --platform ios
  xcodebuild -workspace ios/gagnechris.xcworkspace -scheme gagnechris \
    -configuration Debug -sdk iphonesimulator -destination "id=$udid" \
    -derivedDataPath ios/build build -quiet
fi

xcrun simctl install "$udid" ios/build/Build/Products/Debug-iphonesimulator/gagnechris.app
xcrun simctl terminate "$udid" com.gagnechris.mobile 2>/dev/null || true
# Keep the dev menu's onboarding sheet and floating button off the screen.
for key in EXDevMenuIsOnboardingFinished; do
  xcrun simctl spawn "$udid" defaults write com.gagnechris.mobile "$key" -bool YES
done
for key in EXDevMenuShowsAtLaunch EXDevMenuShowFloatingActionButton; do
  xcrun simctl spawn "$udid" defaults write com.gagnechris.mobile "$key" -bool NO
done
# `--initialUrl` opens the bundle directly; `simctl openurl` would stop at an
# "Open in gagnechris?" prompt.
xcrun simctl launch "$udid" com.gagnechris.mobile --initialUrl "http://127.0.0.1:$port"
echo "Launched on $udid. Start Metro with: npx expo start --dev-client --port $port"
