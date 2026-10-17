#!/usr/bin/env bash
# The Mobile required check and the iOS release both run this, after the root
# and apps/mobile installs, so a release never ships less checked than a PR.
set -euo pipefail

cd "$(dirname "$0")/../.."

npm run typecheck -w @gagnechris/shared
npm run typecheck -w @gagnechris/api-client
npm run typecheck -w @gagnechris/tokens
npm run typecheck -w @gagnechris/app-core
npm run typecheck --prefix apps/mobile

npm run lint --prefix apps/mobile

# TEST_TZ in scripts/verify.ts: a day ahead of UTC most of the day.
export TZ=Pacific/Kiritimati
npm test -w @gagnechris/api-client
npm test -w @gagnechris/tokens
npm test -w @gagnechris/app-core
npm test --prefix apps/mobile

# A successful `expo export` can still bundle `.d.ts` files and crash on
# launch, so check the sourcemap and execute the bundle too.
npm run export:ios --prefix apps/mobile
npm run check:bundle --prefix apps/mobile
npm run smoke:bundle --prefix apps/mobile
