#!/usr/bin/env bash
# Exit 0: no `*-prod` stack is *_IN_PROGRESS or updated since SINCE_EPOCH.
# Exit 3: activity (stacks on stdout). Any other exit is an error.
# Usage (AWS credentials and region in the environment):
#   scripts/ci/prod-stack-activity.sh [SINCE_EPOCH]
set -euo pipefail

SINCE="${1:-}"

# GNU date (CI) or BSD date (macOS). AWS CLI timestamps are UTC, so the first
# 19 chars (YYYY-MM-DDTHH:MM:SS) are enough for the BSD fallback.
to_epoch() {
  date -u -d "$1" +%s 2>/dev/null ||
    date -j -u -f '%Y-%m-%dT%H:%M:%S' "${1:0:19}" +%s
}

rows="$(aws cloudformation describe-stacks \
  --query "Stacks[?ends_with(StackName, '-prod')].[StackName,StackStatus,LastUpdatedTime]" \
  --output text)"

active=()
while IFS=$'\t' read -r name status updated; do
  [ -z "${name}" ] && continue
  if [[ "${status}" == *_IN_PROGRESS ]]; then
    active+=("${name} ${status}")
    continue
  fi
  if [ -n "${SINCE}" ] && [ -n "${updated}" ] && [ "${updated}" != "None" ]; then
    updated_epoch="$(to_epoch "${updated}")"
    if [ "${updated_epoch}" -ge "${SINCE}" ]; then
      active+=("${name} updated ${updated}")
    fi
  fi
done <<<"${rows}"

if [ "${#active[@]}" -gt 0 ]; then
  printf '%s\n' "${active[@]}"
  exit 3
fi
