#!/usr/bin/env bash
# Decides a required check that gates path-filtered jobs. Passes when the
# Changes job and the always-run job succeeded and every gated job succeeded,
# or was skipped because its paths didn't change.
# Usage: scripts/ci/gate-result.sh <changes> <alwaysRun> <pathsChanged> <result>...
set -euo pipefail

CHANGES="${1:?changes job result}"
ALWAYS="${2:?always-run job result}"
CHANGED="${3-}"
shift 3

echo "Changes: ${CHANGES}, always-run: ${ALWAYS}, paths changed: ${CHANGED:-unknown}, gated: $*"
[ "${CHANGES}" = 'success' ] || exit 1
[ "${ALWAYS}" = 'success' ] || exit 1
for r in "$@"; do
  if [ "${r}" = 'success' ]; then continue; fi
  if [ "${r}" = 'skipped' ] && [ "${CHANGED}" != 'true' ]; then continue; fi
  exit 1
done
