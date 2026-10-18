#!/usr/bin/env bash
# Requires gh auth with admin on the repo.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CONFIG_FILE="$ROOT/scripts/github-environments.json"
REPO="${GITHUB_REPOSITORY:-gagnechris/gagnechris}"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required" >&2
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Missing $CONFIG_FILE" >&2
  exit 1
fi

REPO="$REPO" CONFIG_FILE="$CONFIG_FILE" node --input-type=module <<'JS'
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const repo = process.env.REPO;
const cfg = JSON.parse(readFileSync(process.env.CONFIG_FILE, 'utf8'));

const gh = (args, input) =>
  execFileSync('gh', ['api', ...args], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'inherit'],
  });

const listBranchPolicies = (env) =>
  gh([
    '--paginate',
    `repos/${repo}/environments/${env}/deployment-branch-policies?per_page=100`,
    '--jq',
    '.branch_policies[]',
  ])
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

const key = (p) => `${p.name}\0${p.type ?? 'branch'}`;

for (const env of cfg.environments) {
  console.log(`Configuring environment: ${env.name}`);
  gh(
    ['--method', 'PUT', `repos/${repo}/environments/${env.name}`, '--input', '-'],
    JSON.stringify({
      wait_timer: env.wait_timer ?? 0,
      prevent_self_review: env.prevent_self_review ?? false,
      reviewers: env.reviewers ?? [],
      deployment_branch_policy: env.deployment_branch_policy,
    }),
  );

  const desired = env.custom_branch_policies ?? [];
  const desiredKeys = new Set(desired.map(key));
  const existingKeys = new Set(listBranchPolicies(env.name).map(key));

  // Add missing policies first so prod is never left with no allowed ref.
  for (const policy of desired) {
    if (existingKeys.has(key(policy))) {
      console.log(`  Keeping branch policy: ${JSON.stringify(policy)}`);
      continue;
    }
    console.log(`  Adding branch policy: ${JSON.stringify(policy)}`);
    const created = JSON.parse(
      gh(
        [
          '--method',
          'POST',
          `repos/${repo}/environments/${env.name}/deployment-branch-policies`,
          '--input',
          '-',
        ],
        JSON.stringify(policy),
      ),
    );
    console.log(`  -> id=${created.id} name=${created.name} type=${created.type}`);
  }

  for (const policy of listBranchPolicies(env.name)) {
    if (desiredKeys.has(key(policy))) continue;
    console.log(`  Removing extra branch policy id=${policy.id} name=${policy.name}`);
    gh([
      '--method',
      'DELETE',
      `repos/${repo}/environments/${env.name}/deployment-branch-policies/${policy.id}`,
    ]);
  }
}

console.log(
  `Done. Verify with: gh api repos/${repo}/environments --jq '.environments[] | {name, deployment_branch_policy, protection_rules}'`,
);
JS
