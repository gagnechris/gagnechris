#!/usr/bin/env bash
# Waits for a job of this workflow run to finish; fails unless it succeeded.
# Needs GH_TOKEN with actions: read.
set -euo pipefail

export JOB_NAME="${1:?job name}"
timeout="${WAIT_TIMEOUT_SECONDS:-1200}"
interval="${WAIT_INTERVAL_SECONDS:-10}"
deadline=$((SECONDS + timeout))

while :; do
  state="$(gh api "repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}/jobs?filter=latest&per_page=100" \
    --jq '[.jobs[] | select(.name == $ENV.JOB_NAME)][0] | "\(.status) \(.conclusion)"')"
  case "$state" in
    'completed success') echo "${JOB_NAME}: succeeded"; exit 0 ;;
    completed\ *) echo "${JOB_NAME}: ${state#completed }" >&2; exit 1 ;;
  esac
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "${JOB_NAME}: still '${state}' after ${timeout}s" >&2
    exit 1
  fi
  sleep "$interval"
done
