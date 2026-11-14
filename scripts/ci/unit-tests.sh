#!/usr/bin/env bash
# One CI group of the unit tests: `web <i>/<n>` runs that Vitest shard of
# apps/web, `others` runs every other workspace's tests.
set -euo pipefail

group="${1:?group: web or others}"
web='@gagnechris/web'

case "$group" in
  web)
    npm test -w "$web" -- --shard="${2:?shard, e.g. 1/2}"
    ;;
  others)
    args=()
    while IFS= read -r name; do
      args+=(-w "$name")
    done < <(npm query .workspace | node -e '
      const ws = JSON.parse(require("fs").readFileSync(0, "utf8"));
      for (const w of ws) if (w.name !== process.argv[1]) console.log(w.name);
    ' "$web")
    npm test --if-present "${args[@]}"
    ;;
  *)
    echo "Unknown group: $group" >&2
    exit 1
    ;;
esac
