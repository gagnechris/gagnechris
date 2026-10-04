#!/usr/bin/env bash
# Decides whether a completed workflow run on main should email the alerts
# topic. Prints `alert=true|false` and `kind=red-main|deploy-failed|none`.
# Cancelled (replaced by a newer run) and skipped (CDK after a PR's CI, or
# after a red CI) never alert; deploy-lag.sh catches a stall they cause.
# Usage: scripts/ci/main-alert-decision.sh <workflow> <event> <headBranch> <conclusion>
set -euo pipefail

WORKFLOW="${1:?workflow name}"
EVENT="${2:?triggering event}"
BRANCH="${3-}"
CONCLUSION="${4-}"

decide() {
  echo "alert=$1"
  echo "kind=$2"
  exit 0
}

[ "${BRANCH}" = 'main' ] || decide false none

case "${CONCLUSION}" in
  failure | timed_out | startup_failure) ;;
  *) decide false none ;;
esac

case "${WORKFLOW}:${EVENT}" in
  CI:push | Mobile:push) decide true red-main ;;
  # Only the CI-triggered deploy path. Scheduled drift alerts by itself, and a
  # dispatched run has someone watching it.
  CDK:workflow_run) decide true deploy-failed ;;
esac

decide false none
