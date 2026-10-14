#!/usr/bin/env bash
# `eas build --local` in two steps, so EXPO_TOKEN never shares a process with
# the build's dependency install scripts, config plugins or `pod install`.
#
#   prepare <state-dir>      With EXPO_TOKEN: eas-cli bumps the build number,
#                            fetches the signing credentials and packs the
#                            project, then hands the job to this script
#                            (EAS_LOCAL_BUILD_PLUGIN_PATH) instead of the build
#                            plugin, which saves it to <state-dir>.
#   build <state-dir> <ipa>  Without EXPO_TOKEN: runs the build plugin eas-cli
#                            would have run, on the saved job.
#
# The two must run in that order in one job, and no step after `build` in that
# job may hold a secret: the build's install scripts can change the runner.
set -euo pipefail

SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"

save_job() {
  local dir="${EAS_LOCAL_BUILD_STATE:?}"
  umask 077
  printf '%s' "${EAS_LOCAL_BUILD_PLUGIN_INPUT:?}" >"$dir/input"
  # EAS environment variables reach the plugin only through its environment,
  # so keep whatever eas-cli added to the prepare step's environment.
  local key
  : >"$dir/env"
  while IFS= read -r key; do
    case "$key" in
      EXPO_TOKEN | EAS_LOCAL_BUILD_* | SHLVL | _ | PWD | OLDPWD) continue ;;
    esac
    grep -qxF "$key" "$dir/base-env" ||
      printf 'export %s=%q\n' "$key" "${!key}" >>"$dir/env"
  done < <(compgen -e)
}

prepare() {
  local dir="$1"
  : "${EXPO_TOKEN:?prepare needs EXPO_TOKEN}"
  mkdir -p "$dir"
  rm -f "$dir/input" "$dir/env"
  compgen -e >"$dir/base-env"
  EAS_LOCAL_BUILD_PLUGIN_PATH="$SELF" EAS_LOCAL_BUILD_STATE="$dir" \
    eas build --local --platform ios --profile production --non-interactive
  if [ ! -s "$dir/input" ]; then
    echo 'eas build did not hand over a build job' >&2
    exit 1
  fi
}

build() {
  local dir="$1" out="$2"
  if [ -n "${EXPO_TOKEN:-}" ]; then
    echo 'build must run without EXPO_TOKEN' >&2
    exit 1
  fi
  local version
  version="$(node -p 'require(process.argv[1]).version' \
    "$(npm root -g)/eas-cli/node_modules/@expo/eas-build-job/package.json")"
  local input
  input="$(cat "$dir/input")"
  # shellcheck disable=SC1091
  source "$dir/env"
  rm -f "$dir/input" "$dir/env" "$dir/base-env"
  EAS_LOCAL_BUILD_PLUGIN_INPUT="$input" EAS_LOCAL_BUILD_ARTIFACT_PATH="$out" \
    npx -y "eas-cli-local-build-plugin@$version"
}

case "${1:-}" in
  prepare) prepare "${2:?state dir}" ;;
  build) build "${2:?state dir}" "${3:?ipa path}" ;;
  '') save_job ;;
  *)
    echo "usage: $0 prepare <state-dir> | build <state-dir> <ipa>" >&2
    exit 2
    ;;
esac
