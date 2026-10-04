#!/usr/bin/env bash
# Decides whether prod lags main. Prints `alert=true|false` and `reason=...`;
# exits non-zero only when the check itself could not run.
# Age is the committer time (merge time on main) of the oldest undeployed
# first-parent commit that deploy-paths.sh would deploy.
# Usage: scripts/ci/deploy-lag.sh <deployedSha|''> <mainSha>
#   NOW_EPOCH (default: now), LAG_THRESHOLD_SECONDS (default: 7200)
set -euo pipefail

DEPLOYED="${1-}"
MAIN="${2:?main SHA}"
NOW="${NOW_EPOCH:-$(date -u +%s)}"
THRESHOLD="${LAG_THRESHOLD_SECONDS:-7200}"
HERE="$(cd "$(dirname "$0")" && pwd)"

short() { git rev-parse --short=12 "$1"; }

decide() {
  echo "alert=$1"
  echo "reason=$2"
  exit 0
}

if [ -z "${DEPLOYED}" ]; then
  decide true "deployed-sha is missing, so no deploy has been recorded for main $(short "${MAIN}")."
fi

if ! git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
  git fetch --no-tags --quiet origin "${DEPLOYED}" 2>/dev/null || true
fi

if ! git cat-file -e "${DEPLOYED}^{commit}" 2>/dev/null; then
  decide true "deployed-sha ${DEPLOYED} is not in the repository. Every deploy refuses to run until it is fixed."
fi

if [ "$(git rev-parse "${DEPLOYED}^{commit}")" = "$(git rev-parse "${MAIN}^{commit}")" ]; then
  decide false "prod is at main $(short "${MAIN}")."
fi

# A deploy that finished after main was fetched.
if git merge-base --is-ancestor "${MAIN}" "${DEPLOYED}"; then
  decide false "prod $(short "${DEPLOYED}") is ahead of the fetched main $(short "${MAIN}")."
fi

if ! git merge-base --is-ancestor "${DEPLOYED}" "${MAIN}"; then
  decide true "deployed-sha $(short "${DEPLOYED}") is not an ancestor of main $(short "${MAIN}"). Every deploy refuses to run until it is fixed."
fi

deployable() {
  local paths
  paths="$(bash "${HERE}/deploy-paths.sh" "$1" "$2")"
  [[ "${paths}" == *=true* ]]
}

if ! deployable "${DEPLOYED}" "${MAIN}"; then
  decide false "main $(short "${MAIN}") is ahead of prod $(short "${DEPLOYED}") by changes that don't deploy."
fi

oldest=''
while IFS= read -r commit; do
  if deployable "${commit}^1" "${commit}"; then
    oldest="${commit}"
    break
  fi
done < <(git rev-list --reverse --first-parent "${DEPLOYED}..${MAIN}")
# Unreachable while the range diff is the union of first-parent diffs.
if [ -z "${oldest}" ]; then
  oldest="$(git rev-list --reverse --first-parent "${DEPLOYED}..${MAIN}" | head -n 1)"
fi

age=$((NOW - $(git show -s --format=%ct "${oldest}")))
minutes=$((age / 60))
if [ "${age}" -le "${THRESHOLD}" ]; then
  decide false "prod $(short "${DEPLOYED}") lags main $(short "${MAIN}") by ${minutes} min, within the $((THRESHOLD / 60)) min threshold."
fi

decide true "prod $(short "${DEPLOYED}") lags main $(short "${MAIN}"): $(short "${oldest}") has been undeployed for ${minutes} min (threshold $((THRESHOLD / 60)) min)."
