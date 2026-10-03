#!/usr/bin/env bash
# Report CloudFormation activity on the app's `*-prod` stacks (CHR-200).
#
# Exit 0: no stack is *_IN_PROGRESS and, when SINCE_EPOCH is given, none was
# updated at or after it. Exit 3: activity; the stacks are listed on stdout.
# Any other exit is an AWS / script error.
#
# The nightly drift job runs this before and after `cdk drift` so a deploy
# that overlaps the check cannot produce a false drift result. Drift does not
# share the deploy concurrency group because a queued drift run would cancel
# a pending deploy run.
#
# Usage (AWS credentials and region in the environment):
#   scripts/ci/prod-stack-activity.sh [SINCE_EPOCH]
set -euo pipefail

SINCE="${1:-}"

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
    updated_epoch="$(date -u -d "${updated}" +%s)"
    if [ "${updated_epoch}" -ge "${SINCE}" ]; then
      active+=("${name} updated ${updated}")
    fi
  fi
done <<<"${rows}"

if [ "${#active[@]}" -gt 0 ]; then
  printf '%s\n' "${active[@]}"
  exit 3
fi
