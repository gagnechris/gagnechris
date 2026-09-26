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
import json, os, subprocess
from typing import Dict, List, Optional

repo = os.environ["REPO"]
with open(os.environ["CONFIG_FILE"], encoding="utf-8") as f:
    cfg = json.load(f)


def list_branch_policies(env_name: str) -> List[Dict]:
    """Paginate deployment-branch-policies (GitHub may page the list)."""
    policies: List[Dict] = []
    url: Optional[str] = (
        f"repos/{repo}/environments/{env_name}/deployment-branch-policies?per_page=100"
    )
    while url:
        proc = subprocess.run(
            ["gh", "api", "-i", url],
            check=True,
            capture_output=True,
            text=True,
        )
        raw = proc.stdout
        if "\r\n\r\n" in raw:
            header_blob, body = raw.split("\r\n\r\n", 1)
        elif "\n\n" in raw:
            header_blob, body = raw.split("\n\n", 1)
        else:
            header_blob, body = "", raw
        payload = json.loads(body)
        policies.extend(payload.get("branch_policies", []))
        next_url = None
        for line in header_blob.splitlines():
            if line.lower().startswith("link:"):
                for part in line.split(","):
                    if 'rel="next"' in part:
                        start = part.find("<") + 1
                        end = part.find(">")
                        full = part[start:end]
                        marker = "api.github.com/"
                        next_url = (
                            full.split(marker, 1)[-1] if marker in full else full
                        )
        url = next_url
    return policies


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
        [
            "gh",
            "api",
            "--method",
            "PUT",
            f"repos/{repo}/environments/{name}",
            "--input",
            "-",
        ],
        input=json.dumps(body),
        text=True,
        check=True,
    )

    desired = env.get("custom_branch_policies", [])
    desired_keys = {(p["name"], p.get("type", "branch")) for p in desired}

    existing = list_branch_policies(name)
    existing_by_key = {(p["name"], p.get("type", "branch")): p for p in existing}

    # Add missing policies FIRST so prod is never left with zero allowed branches.
    for policy in desired:
        key = (policy["name"], policy.get("type", "branch"))
        if key in existing_by_key:
            print(f"  Keeping branch policy: {policy}")
            continue
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
        print(
            f"  -> id={created.get('id')} name={created.get('name')} type={created.get('type')}"
        )

    # Refresh and remove extras that are not in the desired set.
    for policy in list_branch_policies(name):
        key = (policy["name"], policy.get("type", "branch"))
        if key in desired_keys:
            continue
        pid = policy["id"]
        print(f"  Removing extra branch policy id={pid} name={policy.get('name')}")
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

print(
    f"Done. Verify with: gh api repos/{repo}/environments "
    "--jq '.environments[] | {name, deployment_branch_policy, protection_rules}'"
)
PY
