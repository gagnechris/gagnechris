#!/usr/bin/env bash
# Requires gh auth with admin on the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="${GITHUB_REPOSITORY:-gagnechris/gagnechris}"
RULESET_FILES=(
  "$ROOT/scripts/main-branch-ruleset.json"
  "$ROOT/scripts/ios-release-tag-ruleset.json"
)

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

for ruleset_file in "${RULESET_FILES[@]}"; do
  if [[ ! -f "$ruleset_file" ]]; then
    echo "Missing $ruleset_file" >&2
    exit 1
  fi
  name="$(python3 -c 'import json, sys; print(json.load(open(sys.argv[1]))["name"])' "$ruleset_file")"
  existing_id="$(
    gh api "repos/$REPO/rulesets" --jq ".[] | select(.name==\"$name\") | .id" \
      | head -n 1
  )"

  if [[ -n "$existing_id" ]]; then
    echo "Updating ruleset $name (id=$existing_id)..."
    gh api --method PUT "repos/$REPO/rulesets/$existing_id" \
      --input "$ruleset_file" \
      --jq '{id, name, enforcement, updated_at: .updated_at}'
  else
    echo "Creating ruleset $name..."
    gh api --method POST "repos/$REPO/rulesets" \
      --input "$ruleset_file" \
      --jq '{id, name, enforcement, created_at: .created_at}'
  fi
done

echo "Done. Direct pushes to main should be rejected; PRs need \"Lint, test, and build\", \"Local E2E smoke\", \"API integration (DynamoDB Local)\", and \"Mobile typecheck, lint, test, bundle\" green. Only repository admins can create, move or delete ios-v* tags."
