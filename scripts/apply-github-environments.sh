#!/usr/bin/env bash
# Apply GitHub Environment protection from scripts/github-environments.json.
# Requires gh auth with admin on the repo. Uses Python (jq may be x86-only).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$ROOT/scripts/github-environments.json"
REPO="${GITHUB_REPOSITORY:-gagnechris/gagnechris}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE" >&2
  exit 1
fi

REPO="$REPO" CONFIG_FILE="$CONFIG_FILE" python3 <<'PY'
import json, os, subprocess, sys

repo = os.environ["REPO"]
with open(os.environ["CONFIG_FILE"], encoding="utf-8") as f:
    cfg = json.load(f)

for env in cfg["environments"]:
    name = env["name"]
    print(f"Configuring environment: {name}")
    body = {
        "wait_timer": env.get("wait_timer", 0),
        "prevent_self_review": env.get("prevent_self_review", False),
        "reviewers": env.get("reviewers", []),
        "deployment_branch_policy": env["deployment_branch_policy"],
    }
    subprocess.run(
        ["gh", "api", "--method", "PUT", f"repos/{repo}/environments/{name}", "--input", "-"],
        input=json.dumps(body),
        text=True,
        check=True,
    )

    listed = subprocess.check_output(
        ["gh", "api", f"repos/{repo}/environments/{name}/deployment-branch-policies"],
        text=True,
    )
    for policy in json.loads(listed).get("branch_policies", []):
        pid = policy["id"]
        print(f"  Removing old branch policy id={pid}")
        subprocess.run(
            [
                "gh",
                "api",
                "--method",
                "DELETE",
                f"repos/{repo}/environments/{name}/deployment-branch-policies/{pid}",
            ],
            check=True,
            stdout=subprocess.DEVNULL,
        )

    for policy in env.get("custom_branch_policies", []):
        print(f"  Adding branch policy: {policy}")
        out = subprocess.check_output(
            [
                "gh",
                "api",
                "--method",
                "POST",
                f"repos/{repo}/environments/{name}/deployment-branch-policies",
                "--input",
                "-",
            ],
            input=json.dumps(policy),
            text=True,
        )
        created = json.loads(out)
        print(f"  -> id={created.get('id')} name={created.get('name')} type={created.get('type')}")

print(
    f"Done. Verify with: gh api repos/{repo}/environments "
    "--jq '.environments[] | {name, deployment_branch_policy, protection_rules}'"
)
PY
