#!/usr/bin/env bash
# Apply (or update) the "Protect main" repository ruleset from
# scripts/main-branch-ruleset.json. Requires gh auth with admin on the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RULESET_FILE="$ROOT/scripts/main-branch-ruleset.json"
REPO="${GITHUB_REPOSITORY:-gagnechris/gagnechris}"
RULESET_NAME="Protect main"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

if [[ ! -f "$RULESET_FILE" ]]; then
  echo "Missing $RULESET_FILE" >&2
  exit 1
fi

existing_id="$(
  gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$RULESET_NAME\") | .id" \
    | head -n 1
)"

if [[ -n "$existing_id" ]]; then
  echo "Updating ruleset $RULESET_NAME (id=$existing_id)..."
  gh api --method PUT "repos/$REPO/rulesets/$existing_id" \
    --input "$RULESET_FILE" \
    --jq '{id, name, enforcement, updated_at: .updated_at}'
else
  echo "Creating ruleset $RULESET_NAME..."
  gh api --method POST "repos/$REPO/rulesets" \
    --input "$RULESET_FILE" \
    --jq '{id, name, enforcement, created_at: .created_at}'
fi

echo "Done. Direct pushes to main should be rejected; PRs need \"Lint, test, and build\", \"Local E2E smoke (CHR-82)\", and \"API integration (DynamoDB Local)\" green."
