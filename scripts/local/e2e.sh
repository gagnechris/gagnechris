#!/usr/bin/env bash
# The publish lifecycle smoke: e2e/tests/publish-lifecycle.spec.ts on a private
# stack from e2e/stack.ts (its own DynamoDB container, table and site root).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

if [[ ! -f apps/web/dist/_shell.html ]]; then
  echo "==> Build web app (Cognito placeholders)"
  VITE_COGNITO_USER_POOL_ID="${VITE_COGNITO_USER_POOL_ID:-us-east-1_ciPlaceholder}" \
    VITE_COGNITO_ADMIN_CLIENT_ID="${VITE_COGNITO_ADMIN_CLIENT_ID:-ciplaceholderadminclient000000}" \
    VITE_COGNITO_NOTEBOOK_CLIENT_ID="${VITE_COGNITO_NOTEBOOK_CLIENT_ID:-ciplaceholdernotebookclient000}" \
    VITE_COGNITO_AUTH_DOMAIN="${VITE_COGNITO_AUTH_DOMAIN:-auth.example.com}" \
    env -u VITE_AUTH_MODE -u GA_MEASUREMENT_ID npm run build
fi

exec npx playwright test -c e2e/playwright.config.ts --project api "$@"
